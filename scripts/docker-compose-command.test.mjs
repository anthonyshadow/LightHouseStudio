import { describe, expect, it, vi } from 'vitest';
import { resolveDockerComposeCommand } from './docker-compose-command.mjs';

describe('resolveDockerComposeCommand', () => {
  it('prefers the Docker Compose plugin', () => {
    const isAvailable = vi.fn(() => true);

    expect(resolveDockerComposeCommand(isAvailable)).toEqual({
      executable: 'docker',
      prefixArguments: ['compose'],
    });
    expect(isAvailable).toHaveBeenCalledTimes(1);
  });

  it('falls back to the standalone Docker Compose command', () => {
    expect(
      resolveDockerComposeCommand(({ executable }) => executable === 'docker-compose'),
    ).toEqual({
      executable: 'docker-compose',
      prefixArguments: [],
    });
  });

  it('fails clearly when Docker Compose is unavailable', () => {
    expect(() => resolveDockerComposeCommand(() => false)).toThrow('Docker Compose is unavailable');
  });
});
