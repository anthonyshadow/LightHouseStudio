LOCK TABLE "project_revisions", "project_assets", "project_jobs", "project_outputs", "media_assets", "saved_videos", "video_versions" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
CREATE FUNCTION pg_temp.project_jsonb_has_only_keys(value jsonb, allowed text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_typeof(value) = 'object'
		AND NOT EXISTS (
			SELECT 1 FROM jsonb_object_keys(value) key WHERE key <> ALL (allowed)
		)
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.project_jsonb_has_exact_keys(value jsonb, required text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_typeof(value) = 'object'
		AND value ?& required
		AND NOT EXISTS (
			SELECT 1 FROM jsonb_object_keys(value) key WHERE key <> ALL (required)
		)
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.project_jsonb_is_uuid(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
	IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN
		RETURN false;
	END IF;
	PERFORM (value #>> '{}')::uuid;
	RETURN true;
EXCEPTION WHEN others THEN
	RETURN false;
END
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.project_jsonb_is_datetime(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
	text_value text;
BEGIN
	IF jsonb_typeof(value) IS DISTINCT FROM 'string' THEN
		RETURN false;
	END IF;
	text_value := value #>> '{}';
	IF text_value !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$' THEN
		RETURN false;
	END IF;
	PERFORM text_value::timestamptz;
	RETURN true;
EXCEPTION WHEN others THEN
	RETURN false;
END
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.project_jsonb_is_number(
	value jsonb,
	minimum numeric,
	maximum numeric,
	minimum_inclusive boolean,
	maximum_inclusive boolean,
	integer_only boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
	number_value numeric;
BEGIN
	IF jsonb_typeof(value) IS DISTINCT FROM 'number' THEN
		RETURN false;
	END IF;
	number_value := (value #>> '{}')::numeric;
	RETURN (NOT integer_only OR number_value = trunc(number_value))
		AND (CASE WHEN minimum_inclusive THEN number_value >= minimum ELSE number_value > minimum END)
		AND (CASE WHEN maximum_inclusive THEN number_value <= maximum ELSE number_value < maximum END);
EXCEPTION WHEN others THEN
	RETURN false;
END
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.project_jsonb_is_creative_id(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
	SELECT jsonb_typeof(value) = 'string'
		AND char_length(btrim(value #>> '{}')) BETWEEN 1 AND 200
		AND btrim(value #>> '{}') !~* '^(blob|data|https?):'
$$;--> statement-breakpoint
CREATE FUNCTION pg_temp.project_snapshot_v1_is_valid(value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
	working_media jsonb := value -> 'workingMedia';
	presented_media jsonb := value -> 'presentedMedia';
	character_selection jsonb := value -> 'selectedCharacter';
	outfit_selection jsonb := value -> 'selectedOutfit';
	voice_selection jsonb := value -> 'selectedVoice';
	voice_treatment jsonb;
	visual_treatment jsonb := value -> 'visualTreatment';
	live_mode jsonb := value -> 'liveMode';
	creative_intent jsonb := value -> 'creativeIntent';
	local_edit jsonb := value -> 'localEdit';
	trim_spec jsonb;
	crop_spec jsonb;
	crop_rectangle jsonb;
	adjustments jsonb;
	export_specification jsonb := value -> 'exportSpecification';
	resolution jsonb;
	last_output jsonb := value -> 'lastSuccessfulOutput';
	created_at timestamptz;
	updated_at timestamptz;
	media jsonb;
BEGIN
	IF NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(value, ARRAY[
		'schemaVersion', 'sourceAssetId', 'workingMedia', 'presentedMedia',
		'selectedCharacter', 'selectedOutfit', 'selectedVoice', 'visualTreatment',
		'liveMode', 'creativeIntent', 'localEdit', 'exportSpecification',
		'lastSuccessfulOutput', 'workflowPhase', 'createdAt', 'updatedAt'
	]), false) OR value -> 'schemaVersion' <> '1'::jsonb THEN
		RETURN false;
	END IF;

	IF value -> 'sourceAssetId' <> 'null'::jsonb
		AND NOT pg_temp.project_jsonb_is_uuid(value -> 'sourceAssetId') THEN
		RETURN false;
	END IF;

	FOREACH media IN ARRAY ARRAY[working_media, presented_media] LOOP
		IF media <> 'null'::jsonb THEN
			IF media ->> 'kind' = 'asset' THEN
				IF NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(media, ARRAY['kind', 'assetId']), false)
					OR NOT pg_temp.project_jsonb_is_uuid(media -> 'assetId') THEN
					RETURN false;
				END IF;
			ELSIF media ->> 'kind' = 'saved-video-version' THEN
				IF NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(media, ARRAY['kind', 'savedVideoId', 'videoVersionId']), false)
					OR NOT pg_temp.project_jsonb_is_uuid(media -> 'savedVideoId')
					OR NOT pg_temp.project_jsonb_is_uuid(media -> 'videoVersionId') THEN
					RETURN false;
				END IF;
			ELSE
				RETURN false;
			END IF;
		END IF;
	END LOOP;

	IF character_selection <> 'null'::jsonb AND (
		NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(character_selection, ARRAY['characterId', 'variantId']), false)
		OR NOT pg_temp.project_jsonb_is_creative_id(character_selection -> 'characterId')
		OR (character_selection -> 'variantId' <> 'null'::jsonb
			AND NOT pg_temp.project_jsonb_is_creative_id(character_selection -> 'variantId'))
	) THEN
		RETURN false;
	END IF;

	IF outfit_selection <> 'null'::jsonb AND (
		NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(outfit_selection, ARRAY['outfitId']), false)
		OR NOT pg_temp.project_jsonb_is_creative_id(outfit_selection -> 'outfitId')
	) THEN
		RETURN false;
	END IF;

	IF voice_selection <> 'null'::jsonb THEN
		IF voice_selection ->> 'kind' = 'local-effect' THEN
			IF NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(voice_selection, ARRAY['kind', 'effectId']), false)
				OR voice_selection ->> 'effectId' NOT IN ('warm-studio', 'clear-presenter', 'robot') THEN
				RETURN false;
			END IF;
		ELSIF voice_selection ->> 'kind' = 'saved-voice' THEN
			voice_treatment := voice_selection -> 'treatment';
			IF NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(voice_selection, ARRAY['kind', 'voiceId', 'voiceName', 'treatment']), false)
				OR NOT pg_temp.project_jsonb_is_creative_id(voice_selection -> 'voiceId')
				OR jsonb_typeof(voice_selection -> 'voiceName') IS DISTINCT FROM 'string'
				OR char_length(btrim(voice_selection ->> 'voiceName')) NOT BETWEEN 1 AND 120
				OR NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(voice_treatment, ARRAY['stability', 'similarity', 'style', 'speakerBoost']), false) THEN
				RETURN false;
			END IF;
			IF (voice_treatment -> 'stability' <> 'null'::jsonb AND NOT pg_temp.project_jsonb_is_number(voice_treatment -> 'stability', 0, 1, true, true))
				OR (voice_treatment -> 'similarity' <> 'null'::jsonb AND NOT pg_temp.project_jsonb_is_number(voice_treatment -> 'similarity', 0, 1, true, true))
				OR (voice_treatment -> 'style' <> 'null'::jsonb AND NOT pg_temp.project_jsonb_is_number(voice_treatment -> 'style', 0, 1, true, true))
				OR (voice_treatment -> 'speakerBoost' <> 'null'::jsonb AND jsonb_typeof(voice_treatment -> 'speakerBoost') IS DISTINCT FROM 'boolean') THEN
				RETURN false;
			END IF;
		ELSE
			RETURN false;
		END IF;
	END IF;

	IF NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(visual_treatment, ARRAY['kind']), false)
		OR visual_treatment ->> 'kind' NOT IN ('none', 'character-swap', 'virtual-try-on')
		OR (visual_treatment ->> 'kind' = 'character-swap' AND character_selection = 'null'::jsonb)
		OR (visual_treatment ->> 'kind' = 'virtual-try-on' AND outfit_selection = 'null'::jsonb) THEN
		RETURN false;
	END IF;

	IF live_mode <> 'null'::jsonb AND (
		NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(live_mode, ARRAY['modeId', 'captureFormat', 'audioSource']), false)
		OR NOT pg_temp.project_jsonb_is_creative_id(live_mode -> 'modeId')
		OR live_mode ->> 'captureFormat' NOT IN ('landscape', 'portrait', 'freeform')
		OR live_mode ->> 'audioSource' NOT IN ('local-microphone', 'model-output', 'none')
	) THEN
		RETURN false;
	END IF;

	IF NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(creative_intent, ARRAY['promptId', 'recipeId', 'userIntent']), false)
		OR (creative_intent -> 'promptId' <> 'null'::jsonb AND NOT pg_temp.project_jsonb_is_creative_id(creative_intent -> 'promptId'))
		OR (creative_intent -> 'recipeId' <> 'null'::jsonb AND NOT pg_temp.project_jsonb_is_creative_id(creative_intent -> 'recipeId'))
		OR jsonb_typeof(creative_intent -> 'userIntent') IS DISTINCT FROM 'string'
		OR char_length(creative_intent ->> 'userIntent') > 4000 THEN
		RETURN false;
	END IF;

	IF local_edit <> 'null'::jsonb THEN
		trim_spec := local_edit -> 'trim';
		crop_spec := local_edit -> 'crop';
		crop_rectangle := crop_spec -> 'rectangle';
		adjustments := local_edit -> 'adjustments';
		IF NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(local_edit, ARRAY['trim', 'crop', 'rotation', 'flipHorizontal', 'flipVertical', 'adjustments', 'filter']), false)
			OR NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(trim_spec, ARRAY['startMs', 'endMs']), false)
			OR NOT pg_temp.project_jsonb_is_number(trim_spec -> 'startMs', 0, 1e1000, true, true)
			OR NOT pg_temp.project_jsonb_is_number(trim_spec -> 'endMs', 0, 1e1000, false, true)
			OR (trim_spec ->> 'endMs')::numeric <= (trim_spec ->> 'startMs')::numeric
			OR NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(crop_spec, ARRAY['preset', 'rectangle']), false)
			OR crop_spec ->> 'preset' NOT IN ('original', 'freeform', '16:9', '9:16', '1:1', '4:5')
			OR NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(crop_rectangle, ARRAY['x', 'y', 'width', 'height']), false)
			OR NOT pg_temp.project_jsonb_is_number(crop_rectangle -> 'x', 0, 1, true, true)
			OR NOT pg_temp.project_jsonb_is_number(crop_rectangle -> 'y', 0, 1, true, true)
			OR NOT pg_temp.project_jsonb_is_number(crop_rectangle -> 'width', 0, 1, false, true)
			OR NOT pg_temp.project_jsonb_is_number(crop_rectangle -> 'height', 0, 1, false, true)
			OR (crop_rectangle ->> 'x')::numeric + (crop_rectangle ->> 'width')::numeric > 1
			OR (crop_rectangle ->> 'y')::numeric + (crop_rectangle ->> 'height')::numeric > 1
			OR local_edit ->> 'rotation' NOT IN ('0', '90', '180', '270')
			OR jsonb_typeof(local_edit -> 'rotation') IS DISTINCT FROM 'number'
			OR jsonb_typeof(local_edit -> 'flipHorizontal') IS DISTINCT FROM 'boolean'
			OR jsonb_typeof(local_edit -> 'flipVertical') IS DISTINCT FROM 'boolean'
			OR NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(adjustments, ARRAY['brightness', 'contrast', 'saturation', 'temperature', 'highlights', 'shadows']), false)
			OR NOT pg_temp.project_jsonb_is_number(adjustments -> 'brightness', -100, 100, true, true)
			OR NOT pg_temp.project_jsonb_is_number(adjustments -> 'contrast', -100, 100, true, true)
			OR NOT pg_temp.project_jsonb_is_number(adjustments -> 'saturation', -100, 100, true, true)
			OR NOT pg_temp.project_jsonb_is_number(adjustments -> 'temperature', -100, 100, true, true)
			OR NOT pg_temp.project_jsonb_is_number(adjustments -> 'highlights', -100, 100, true, true)
			OR NOT pg_temp.project_jsonb_is_number(adjustments -> 'shadows', -100, 100, true, true)
			OR local_edit ->> 'filter' NOT IN ('original', 'vivid', 'warm', 'cool', 'mono', 'fade') THEN
			RETURN false;
		END IF;
	END IF;

	IF export_specification <> 'null'::jsonb THEN
		resolution := export_specification -> 'resolution';
		IF NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(export_specification, ARRAY['container', 'aspect', 'resolution', 'includeAudio']), false)
			OR export_specification ->> 'container' <> 'video/mp4'
			OR export_specification ->> 'aspect' NOT IN ('source', '16:9', '9:16', '1:1', '4:5')
			OR jsonb_typeof(export_specification -> 'includeAudio') IS DISTINCT FROM 'boolean' THEN
			RETURN false;
		END IF;
		IF resolution <> 'null'::jsonb AND (
			NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(resolution, ARRAY['width', 'height']), false)
			OR NOT pg_temp.project_jsonb_is_number(resolution -> 'width', 0, 16384, false, true, true)
			OR NOT pg_temp.project_jsonb_is_number(resolution -> 'height', 0, 16384, false, true, true)
		) THEN
			RETURN false;
		END IF;
	END IF;

	IF last_output <> 'null'::jsonb AND (
		NOT COALESCE(pg_temp.project_jsonb_has_exact_keys(last_output, ARRAY['savedVideoId', 'videoVersionId']), false)
		OR NOT pg_temp.project_jsonb_is_uuid(last_output -> 'savedVideoId')
		OR NOT pg_temp.project_jsonb_is_uuid(last_output -> 'videoVersionId')
	) THEN
		RETURN false;
	END IF;

	IF value ->> 'workflowPhase' NOT IN ('source', 'creative', 'processing', 'review', 'export', 'complete')
		OR NOT pg_temp.project_jsonb_is_datetime(value -> 'createdAt')
		OR NOT pg_temp.project_jsonb_is_datetime(value -> 'updatedAt') THEN
		RETURN false;
	END IF;
	created_at := (value ->> 'createdAt')::timestamptz;
	updated_at := (value ->> 'updatedAt')::timestamptz;
	RETURN updated_at >= created_at;
EXCEPTION WHEN others THEN
	RETURN false;
END
$$;--> statement-breakpoint
DO $$
DECLARE
	invalid_revisions text;
BEGIN
	WITH invalid AS (
		SELECT revision.id
		FROM project_revisions revision
		WHERE NOT pg_temp.project_snapshot_v1_is_valid(revision.snapshot)
			OR revision.snapshot_schema_version <> 1
			OR jsonb_typeof(revision.snapshot) <> 'object'
			OR revision.snapshot ->> 'schemaVersion' <> '1'
			OR NOT revision.snapshot ?& ARRAY[
				'schemaVersion', 'sourceAssetId', 'workingMedia', 'presentedMedia',
				'selectedCharacter', 'selectedOutfit', 'selectedVoice', 'visualTreatment',
				'liveMode', 'creativeIntent', 'localEdit', 'exportSpecification',
				'lastSuccessfulOutput', 'workflowPhase', 'createdAt', 'updatedAt'
			]
			OR EXISTS (
				SELECT 1 FROM jsonb_object_keys(revision.snapshot) key
				WHERE key <> ALL (ARRAY[
					'schemaVersion', 'sourceAssetId', 'workingMedia', 'presentedMedia',
					'selectedCharacter', 'selectedOutfit', 'selectedVoice', 'visualTreatment',
					'liveMode', 'creativeIntent', 'localEdit', 'exportSpecification',
					'lastSuccessfulOutput', 'workflowPhase', 'createdAt', 'updatedAt'
				])
			)
			OR (revision.snapshot -> 'workingMedia' IS NOT NULL
				AND revision.snapshot -> 'workingMedia' <> 'null'::jsonb
				AND (
					jsonb_typeof(revision.snapshot -> 'workingMedia') <> 'object'
					OR revision.snapshot -> 'workingMedia' ->> 'kind' NOT IN ('asset', 'saved-video-version')
					OR NOT pg_temp.project_jsonb_has_only_keys(
						revision.snapshot -> 'workingMedia',
						CASE revision.snapshot -> 'workingMedia' ->> 'kind'
							WHEN 'asset' THEN ARRAY['kind', 'assetId']
							ELSE ARRAY['kind', 'savedVideoId', 'videoVersionId']
						END
					)
				))
			OR (revision.snapshot -> 'presentedMedia' IS NOT NULL
				AND revision.snapshot -> 'presentedMedia' <> 'null'::jsonb
				AND (
					jsonb_typeof(revision.snapshot -> 'presentedMedia') <> 'object'
					OR revision.snapshot -> 'presentedMedia' ->> 'kind' NOT IN ('asset', 'saved-video-version')
					OR NOT pg_temp.project_jsonb_has_only_keys(
						revision.snapshot -> 'presentedMedia',
						CASE revision.snapshot -> 'presentedMedia' ->> 'kind'
							WHEN 'asset' THEN ARRAY['kind', 'assetId']
							ELSE ARRAY['kind', 'savedVideoId', 'videoVersionId']
						END
					)
				))
			OR (revision.snapshot -> 'selectedCharacter' <> 'null'::jsonb
				AND NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'selectedCharacter', ARRAY['characterId', 'variantId']))
			OR (revision.snapshot -> 'selectedOutfit' <> 'null'::jsonb
				AND NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'selectedOutfit', ARRAY['outfitId']))
			OR NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'visualTreatment', ARRAY['kind'])
			OR revision.snapshot -> 'visualTreatment' ->> 'kind' NOT IN ('none', 'character-swap', 'virtual-try-on')
			OR (revision.snapshot -> 'liveMode' <> 'null'::jsonb
				AND NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'liveMode', ARRAY['modeId', 'captureFormat', 'audioSource']))
			OR NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'creativeIntent', ARRAY['promptId', 'recipeId', 'userIntent'])
			OR (revision.snapshot -> 'selectedVoice' <> 'null'::jsonb AND (
				revision.snapshot -> 'selectedVoice' ->> 'kind' NOT IN ('local-effect', 'saved-voice')
				OR NOT pg_temp.project_jsonb_has_only_keys(
					revision.snapshot -> 'selectedVoice',
					CASE revision.snapshot -> 'selectedVoice' ->> 'kind'
						WHEN 'local-effect' THEN ARRAY['kind', 'effectId']
						ELSE ARRAY['kind', 'voiceId', 'voiceName', 'treatment']
					END
				)
				OR (revision.snapshot -> 'selectedVoice' ->> 'kind' = 'saved-voice'
					AND NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'selectedVoice' -> 'treatment', ARRAY['stability', 'similarity', 'style', 'speakerBoost']))
			))
			OR (revision.snapshot -> 'localEdit' <> 'null'::jsonb AND (
				NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'localEdit', ARRAY['trim', 'crop', 'rotation', 'flipHorizontal', 'flipVertical', 'adjustments', 'filter'])
				OR NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'localEdit' -> 'trim', ARRAY['startMs', 'endMs'])
				OR NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'localEdit' -> 'crop', ARRAY['preset', 'rectangle'])
				OR NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'localEdit' -> 'crop' -> 'rectangle', ARRAY['x', 'y', 'width', 'height'])
				OR NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'localEdit' -> 'adjustments', ARRAY['brightness', 'contrast', 'saturation', 'temperature', 'highlights', 'shadows'])
			))
			OR (revision.snapshot -> 'exportSpecification' <> 'null'::jsonb AND (
				NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'exportSpecification', ARRAY['container', 'aspect', 'resolution', 'includeAudio'])
				OR (revision.snapshot -> 'exportSpecification' -> 'resolution' <> 'null'::jsonb
					AND NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'exportSpecification' -> 'resolution', ARRAY['width', 'height']))
			))
			OR (revision.snapshot -> 'lastSuccessfulOutput' <> 'null'::jsonb
				AND NOT pg_temp.project_jsonb_has_only_keys(revision.snapshot -> 'lastSuccessfulOutput', ARRAY['savedVideoId', 'videoVersionId']))
			OR revision.snapshot ->> 'workflowPhase' NOT IN ('source', 'creative', 'processing', 'review', 'export', 'complete')
		LIMIT 20
	)
	SELECT string_agg(id::text, ', ') INTO invalid_revisions FROM invalid;
	IF invalid_revisions IS NOT NULL THEN
		RAISE EXCEPTION USING
			MESSAGE = 'Project invariant migration preflight failed: unsupported or non-strict snapshots: ' || invalid_revisions,
			HINT = 'Repair these Project snapshots with the v1 strict contract before retrying; no migration changes were applied.';
	END IF;
END $$;--> statement-breakpoint
DROP FUNCTION pg_temp.project_snapshot_v1_is_valid(jsonb);--> statement-breakpoint
DROP FUNCTION pg_temp.project_jsonb_is_creative_id(jsonb);--> statement-breakpoint
DROP FUNCTION pg_temp.project_jsonb_is_number(jsonb, numeric, numeric, boolean, boolean, boolean);--> statement-breakpoint
DROP FUNCTION pg_temp.project_jsonb_is_datetime(jsonb);--> statement-breakpoint
DROP FUNCTION pg_temp.project_jsonb_is_uuid(jsonb);--> statement-breakpoint
DROP FUNCTION pg_temp.project_jsonb_has_exact_keys(jsonb, text[]);--> statement-breakpoint
DROP FUNCTION pg_temp.project_jsonb_has_only_keys(jsonb, text[]);--> statement-breakpoint
DO $$
DECLARE
	invalid_relations text;
BEGIN
	WITH declared_asset AS (
		SELECT revision.project_id, revision.owner_user_id, revision.id AS revision_id,
			revision.revision_number, (revision.snapshot ->> 'sourceAssetId')::uuid AS asset_id,
			'source'::text AS role
		FROM project_revisions revision
		WHERE revision.snapshot ->> 'sourceAssetId' IS NOT NULL
		UNION ALL
		SELECT revision.project_id, revision.owner_user_id, revision.id, revision.revision_number,
			(revision.snapshot -> 'workingMedia' ->> 'assetId')::uuid, 'working'
		FROM project_revisions revision
		WHERE revision.snapshot -> 'workingMedia' ->> 'kind' = 'asset'
		UNION ALL
		SELECT revision.project_id, revision.owner_user_id, revision.id, revision.revision_number,
			(revision.snapshot -> 'presentedMedia' ->> 'assetId')::uuid, 'presented'
		FROM project_revisions revision
		WHERE revision.snapshot -> 'presentedMedia' ->> 'kind' = 'asset'
	), invalid AS (
		SELECT declared.revision_id, declared.asset_id, declared.role
		FROM declared_asset declared
		LEFT JOIN media_assets asset
			ON asset.id = declared.asset_id
			AND asset.owner_user_id = declared.owner_user_id
			AND asset.status = 'ready'
		WHERE asset.id IS NULL
		UNION ALL
		SELECT link.revision_id, link.asset_id, link.role::text
		FROM project_assets link
		LEFT JOIN declared_asset declared
			ON declared.project_id = link.project_id
			AND declared.owner_user_id = link.owner_user_id
			AND declared.revision_id = link.revision_id
			AND declared.revision_number = link.revision_number
			AND declared.asset_id = link.asset_id
			AND declared.role = link.role::text
		WHERE declared.revision_id IS NULL
		LIMIT 20
	)
	SELECT string_agg(revision_id::text || '/' || asset_id::text || '/' || role, ', ')
	INTO invalid_relations FROM invalid;
	IF invalid_relations IS NOT NULL THEN
		RAISE EXCEPTION USING
			MESSAGE = 'Project invariant migration preflight failed: direct asset lineage cannot be proven: ' || invalid_relations,
			HINT = 'Restore the same-owner ready media facts or remove the unsupported Project row after review; roles and provenance are never inferred.';
	END IF;

	WITH duplicate_job AS (
		SELECT job_id FROM project_jobs GROUP BY job_id HAVING count(*) > 1 LIMIT 20
	), duplicate_output AS (
		SELECT video_version_id FROM project_outputs GROUP BY video_version_id HAVING count(*) > 1 LIMIT 20
	)
	SELECT string_agg(value, ', ') INTO invalid_relations
	FROM (
		SELECT 'job:' || job_id::text AS value FROM duplicate_job
		UNION ALL
		SELECT 'output:' || video_version_id::text FROM duplicate_output
	) conflicts;
	IF invalid_relations IS NOT NULL THEN
		RAISE EXCEPTION USING
			MESSAGE = 'Project invariant migration preflight failed: multiple producer relations exist: ' || invalid_relations,
			HINT = 'Reconcile the exact initiating/producing Project revision before retrying.';
	END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE
	invalid_versions text;
BEGIN
	WITH declared_version AS (
		SELECT revision.project_id, revision.owner_user_id, revision.id AS revision_id,
			revision.revision_number, media.role,
			(media.value ->> 'savedVideoId')::uuid AS saved_video_id,
			(media.value ->> 'videoVersionId')::uuid AS video_version_id
		FROM project_revisions revision
		CROSS JOIN LATERAL (VALUES
			('working', revision.snapshot -> 'workingMedia'),
			('presented', revision.snapshot -> 'presentedMedia')
		) media(role, value)
		WHERE media.value ->> 'kind' = 'saved-video-version'
	), invalid AS (
		SELECT declared.revision_id, declared.saved_video_id, declared.video_version_id, declared.role
		FROM declared_version declared
		LEFT JOIN saved_videos video
			ON video.id = declared.saved_video_id
			AND video.owner_user_id = declared.owner_user_id
			AND video.status = 'ready'
			AND video.deleted_at IS NULL
		LEFT JOIN video_versions version
			ON version.id = declared.video_version_id
			AND version.video_id = declared.saved_video_id
			AND version.owner_user_id = declared.owner_user_id
		WHERE video.id IS NULL OR version.id IS NULL
		UNION ALL
		SELECT revision.id,
			(revision.snapshot -> 'lastSuccessfulOutput' ->> 'savedVideoId')::uuid,
			(revision.snapshot -> 'lastSuccessfulOutput' ->> 'videoVersionId')::uuid,
			'lastSuccessfulOutput'
		FROM project_revisions revision
		LEFT JOIN project_outputs output
			ON output.project_id = revision.project_id
			AND output.owner_user_id = revision.owner_user_id
			AND output.saved_video_id = (revision.snapshot -> 'lastSuccessfulOutput' ->> 'savedVideoId')::uuid
			AND output.video_version_id = (revision.snapshot -> 'lastSuccessfulOutput' ->> 'videoVersionId')::uuid
		WHERE revision.snapshot -> 'lastSuccessfulOutput' <> 'null'::jsonb
			AND output.video_version_id IS NULL
		LIMIT 20
	)
	SELECT string_agg(revision_id::text || '/' || saved_video_id::text || '/' || video_version_id::text || '/' || role, ', ')
	INTO invalid_versions FROM invalid;
	IF invalid_versions IS NOT NULL THEN
		RAISE EXCEPTION USING
			MESSAGE = 'Project invariant migration preflight failed: Saved Video Version lineage cannot be proven: ' || invalid_versions,
			HINT = 'Restore the exact same-owner active Version/output relation or repair the snapshot before retrying.';
	END IF;
END $$;--> statement-breakpoint
CREATE TYPE "public"."project_version_reference_role" AS ENUM('working', 'presented');--> statement-breakpoint
CREATE TABLE "project_version_references" (
	"project_id" uuid NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"saved_video_id" uuid NOT NULL,
	"video_version_id" uuid NOT NULL,
	"role" "project_version_reference_role" NOT NULL,
	"revision_id" uuid NOT NULL,
	"revision_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_version_references_project_id_revision_id_saved_video_id_video_version_id_role_pk" PRIMARY KEY("project_id","revision_id","saved_video_id","video_version_id","role")
);
--> statement-breakpoint
ALTER TABLE "project_jobs" RENAME COLUMN "revision_id" TO "initiating_revision_id";--> statement-breakpoint
ALTER TABLE "project_jobs" RENAME COLUMN "revision_number" TO "initiating_revision_number";--> statement-breakpoint
ALTER TABLE "project_outputs" RENAME COLUMN "revision_id" TO "producing_revision_id";--> statement-breakpoint
ALTER TABLE "project_outputs" RENAME COLUMN "revision_number" TO "producing_revision_number";--> statement-breakpoint
ALTER TABLE "project_jobs" DROP CONSTRAINT "project_jobs_revision_same_project_fk";
--> statement-breakpoint
ALTER TABLE "project_outputs" DROP CONSTRAINT "project_outputs_revision_same_project_fk";
--> statement-breakpoint
ALTER TABLE "project_assets" DROP CONSTRAINT "project_assets_project_id_asset_id_role_pk";--> statement-breakpoint
ALTER TABLE "project_jobs" DROP CONSTRAINT "project_jobs_project_id_job_id_pk";--> statement-breakpoint
ALTER TABLE "project_outputs" DROP CONSTRAINT "project_outputs_project_id_saved_video_id_video_version_id_pk";--> statement-breakpoint
ALTER TABLE "project_assets" ADD CONSTRAINT "project_assets_project_id_revision_id_asset_id_role_pk" PRIMARY KEY("project_id","revision_id","asset_id","role");--> statement-breakpoint
ALTER TABLE "project_jobs" ADD CONSTRAINT "project_jobs_job_id_pk" PRIMARY KEY("job_id");--> statement-breakpoint
ALTER TABLE "project_outputs" ADD CONSTRAINT "project_outputs_video_version_id_pk" PRIMARY KEY("video_version_id");--> statement-breakpoint
INSERT INTO "project_assets" ("project_id", "owner_user_id", "asset_id", "role", "revision_id", "revision_number", "created_at")
SELECT revision.project_id, revision.owner_user_id, declared.asset_id, declared.role::project_asset_role,
	revision.id, revision.revision_number, revision.created_at
FROM project_revisions revision
CROSS JOIN LATERAL (VALUES
	((revision.snapshot ->> 'sourceAssetId')::uuid, 'source'),
	((CASE WHEN revision.snapshot -> 'workingMedia' ->> 'kind' = 'asset' THEN revision.snapshot -> 'workingMedia' ->> 'assetId' END)::uuid, 'working'),
	((CASE WHEN revision.snapshot -> 'presentedMedia' ->> 'kind' = 'asset' THEN revision.snapshot -> 'presentedMedia' ->> 'assetId' END)::uuid, 'presented')
) declared(asset_id, role)
WHERE declared.asset_id IS NOT NULL
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "project_version_references" ("project_id", "owner_user_id", "saved_video_id", "video_version_id", "role", "revision_id", "revision_number", "created_at")
SELECT revision.project_id, revision.owner_user_id,
	(media.value ->> 'savedVideoId')::uuid, (media.value ->> 'videoVersionId')::uuid,
	media.role::project_version_reference_role, revision.id, revision.revision_number, revision.created_at
FROM project_revisions revision
CROSS JOIN LATERAL (VALUES
	('working', revision.snapshot -> 'workingMedia'),
	('presented', revision.snapshot -> 'presentedMedia')
) media(role, value)
WHERE media.value ->> 'kind' = 'saved-video-version';--> statement-breakpoint
ALTER TABLE "project_version_references" ADD CONSTRAINT "project_version_references_project_owner_fk" FOREIGN KEY ("project_id","owner_user_id") REFERENCES "public"."projects"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_version_references" ADD CONSTRAINT "project_version_references_video_owner_fk" FOREIGN KEY ("saved_video_id","owner_user_id") REFERENCES "public"."saved_videos"("id","owner_user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_version_references" ADD CONSTRAINT "project_version_references_version_same_video_fk" FOREIGN KEY ("saved_video_id","owner_user_id","video_version_id") REFERENCES "public"."video_versions"("video_id","owner_user_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_version_references" ADD CONSTRAINT "project_version_references_revision_same_project_fk" FOREIGN KEY ("project_id","owner_user_id","revision_id","revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_version_references_project_revision_idx" ON "project_version_references" USING btree ("project_id","revision_number","created_at");--> statement-breakpoint
CREATE INDEX "project_version_references_version_idx" ON "project_version_references" USING btree ("owner_user_id","saved_video_id","video_version_id");--> statement-breakpoint
ALTER TABLE "project_jobs" ADD CONSTRAINT "project_jobs_revision_same_project_fk" FOREIGN KEY ("project_id","owner_user_id","initiating_revision_id","initiating_revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_outputs" ADD CONSTRAINT "project_outputs_revision_same_project_fk" FOREIGN KEY ("project_id","owner_user_id","producing_revision_id","producing_revision_number") REFERENCES "public"."project_revisions"("project_id","owner_user_id","id","revision_number") ON DELETE restrict ON UPDATE no action;
