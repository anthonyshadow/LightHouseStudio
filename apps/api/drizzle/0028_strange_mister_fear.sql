LOCK TABLE "project_sources" IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint
DO $$
DECLARE
	unnamed text;
BEGIN
	-- The reads this migration unblocks stop taking whichever source row the plan reaches first and
	-- start taking the one the current revision names. That swap is only invisible if every held
	-- source IS the one its Project's current revision names — which `assertReadyProjectSource` has
	-- asserted on every acceptance, but which nothing has ever checked against stored rows. A row
	-- that disagrees would turn `GET /projects/:id/source` into a 404 after this migration, so it is
	-- refused here rather than discovered in production.
	--
	-- The primary key swap below needs no preflight of its own: the key it replaces is still in
	-- force while this runs, so it already guarantees the uniqueness the wider key asks for.
	SELECT string_agg(source.project_id::text || '/' || source.asset_id::text, ', ') INTO unnamed
	FROM (
		SELECT held.project_id, held.asset_id
		FROM project_sources held
		JOIN projects project
			ON project.id = held.project_id AND project.owner_user_id = held.owner_user_id
		JOIN project_revisions revision
			ON revision.project_id = project.id
			AND revision.owner_user_id = project.owner_user_id
			AND revision.id = project.current_revision_id
			AND revision.revision_number = project.current_revision_number
		WHERE held.asset_id::text IS DISTINCT FROM (revision.snapshot ->> 'sourceAssetId')
		LIMIT 20
	) source;
	IF unnamed IS NOT NULL THEN
		RAISE EXCEPTION USING
			MESSAGE = 'Project source expand preflight failed: held sources the current revision does not name: ' || unnamed,
			HINT = 'Reconcile these project_sources rows with their revision snapshot before retrying; no migration changes were applied.';
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "project_sources" DROP CONSTRAINT "project_sources_pkey";--> statement-breakpoint
ALTER TABLE "project_sources" ADD CONSTRAINT "project_sources_project_id_asset_id_pk" PRIMARY KEY("project_id","asset_id");--> statement-breakpoint
CREATE INDEX "project_sources_version_idx" ON "project_sources" USING btree ("owner_user_id","saved_video_id","video_version_id");
