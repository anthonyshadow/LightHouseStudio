export interface ProjectObjectUrlRegistry {
  create(projectId: string, artifactId: string, blob: Blob): string;
  get(projectId: string, artifactId: string): string | null;
  revokeArtifact(projectId: string, artifactId: string): void;
  revokeProject(projectId: string): void;
  revokeAll(): void;
  readonly size: number;
}

export interface ProjectObjectUrlRegistryOptions {
  readonly createObjectURL?: (blob: Blob) => string;
  readonly revokeObjectURL?: (url: string) => void;
}

const browserCreateObjectUrl = (blob: Blob) => URL.createObjectURL(blob);
const browserRevokeObjectUrl = (url: string) => URL.revokeObjectURL(url);

/**
 * Owns hydrated object URLs separately from durable project records. Replacing
 * or closing a project always revokes its runtime URLs without touching Blobs.
 */
export const createProjectObjectUrlRegistry = (
  options: ProjectObjectUrlRegistryOptions = {},
): ProjectObjectUrlRegistry => {
  const createObjectURL = options.createObjectURL ?? browserCreateObjectUrl;
  const revokeObjectURL = options.revokeObjectURL ?? browserRevokeObjectUrl;
  const projects = new Map<string, Map<string, string>>();

  const revokeUrl = (url: string) => {
    try {
      revokeObjectURL(url);
    } catch {
      // Cleanup is best effort; ownership is still released from the registry.
    }
  };

  return {
    create(projectId, artifactId, blob) {
      const existing = projects.get(projectId)?.get(artifactId);
      const objectUrl = createObjectURL(blob);
      if (!objectUrl) throw new Error('The browser did not create a project media URL.');
      let project = projects.get(projectId);
      if (!project) {
        project = new Map();
        projects.set(projectId, project);
      }
      project.set(artifactId, objectUrl);
      if (existing) revokeUrl(existing);
      return objectUrl;
    },
    get(projectId, artifactId) {
      return projects.get(projectId)?.get(artifactId) ?? null;
    },
    revokeArtifact(projectId, artifactId) {
      const project = projects.get(projectId);
      const objectUrl = project?.get(artifactId);
      if (!project || !objectUrl) return;
      project.delete(artifactId);
      if (project.size === 0) projects.delete(projectId);
      revokeUrl(objectUrl);
    },
    revokeProject(projectId) {
      const project = projects.get(projectId);
      if (!project) return;
      projects.delete(projectId);
      for (const objectUrl of project.values()) revokeUrl(objectUrl);
    },
    revokeAll() {
      const urls = [...projects.values()].flatMap((project) => [...project.values()]);
      projects.clear();
      for (const objectUrl of urls) revokeUrl(objectUrl);
    },
    get size() {
      let size = 0;
      for (const project of projects.values()) size += project.size;
      return size;
    },
  };
};
