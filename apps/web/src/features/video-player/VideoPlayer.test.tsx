// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { VideoPlayer } from './VideoPlayer';

describe('VideoPlayer', () => {
  it('keeps accessible playback controls visible and owns playback state', () => {
    render(
      <StudioDesignProvider>
        <VideoPlayer src="/preview.mp4" title="Library source" />
      </StudioDesignProvider>,
    );

    const video = screen.getByLabelText<HTMLVideoElement>('Preview of Library source');
    const controls = screen.getByRole('group', { name: 'Video controls' });
    expect(video).not.toHaveAttribute('controls');
    expect(controls).toBeVisible();
    expect(within(controls).getByRole('button', { name: 'Play video' })).toBeVisible();
    expect(within(controls).getByRole('slider', { name: 'Video position' })).toBeDisabled();
    expect(within(controls).getByRole('button', { name: 'Mute' })).toBeVisible();

    Object.defineProperty(video, 'duration', { configurable: true, value: 90 });
    Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 });
    Object.defineProperty(video, 'muted', { configurable: true, writable: true, value: false });
    const play = vi.spyOn(video, 'play').mockResolvedValue();
    const pause = vi.spyOn(video, 'pause').mockImplementation(() => undefined);

    fireEvent.loadedMetadata(video);
    const position = within(controls).getByRole<HTMLInputElement>('slider', {
      name: 'Video position',
    });
    expect(position).toBeEnabled();
    expect(screen.getByLabelText('Video elapsed and total time')).toHaveTextContent('0:00 / 1:30');

    fireEvent.click(within(controls).getByRole('button', { name: 'Play video' }));
    expect(play).toHaveBeenCalledOnce();
    fireEvent.play(video);
    expect(within(controls).getByRole('button', { name: 'Pause video' })).toBeVisible();

    fireEvent.change(position, { target: { value: '45' } });
    expect(video.currentTime).toBe(45);
    expect(screen.getByLabelText('Video elapsed and total time')).toHaveTextContent('0:45 / 1:30');

    fireEvent.click(within(controls).getByRole('button', { name: 'Pause video' }));
    expect(pause).toHaveBeenCalledOnce();
    fireEvent.pause(video);
    expect(within(controls).getByRole('button', { name: 'Play video' })).toBeVisible();

    fireEvent.click(within(controls).getByRole('button', { name: 'Mute' }));
    expect(video.muted).toBe(true);
    expect(within(controls).getByRole('button', { name: 'Unmute' })).toBeVisible();
  });
});
