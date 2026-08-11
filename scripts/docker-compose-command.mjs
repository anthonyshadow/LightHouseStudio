const candidates = [
  { executable: 'docker', prefixArguments: ['compose'] },
  { executable: 'docker-compose', prefixArguments: [] },
];

export const resolveDockerComposeCommand = (isAvailable) => {
  const candidate = candidates.find(isAvailable);
  if (candidate) return candidate;

  throw new Error(
    'Docker Compose is unavailable. Install the Docker Compose plugin or the standalone docker-compose command.',
  );
};
