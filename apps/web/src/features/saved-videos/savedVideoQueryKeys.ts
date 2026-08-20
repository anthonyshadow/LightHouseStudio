export const savedVideoQueryKeys = {
  lists: ['saved-videos', 'list'] as const,
  /**
   * Kept outside `lists` on purpose. Surfaces that rewrite a saved Video in place do it with
   * `setQueriesData` across the whole `lists` prefix and assume every entry there is paged, so a
   * single-page count cached under it would be reshaped rather than updated.
   */
  total: ['saved-videos', 'total'] as const,
};
