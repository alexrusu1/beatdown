import type { Song, SongSelection } from '../game.logic/engine';
import allSongs from '../data/songs.json';

/**
 * Converts a year (e.g., 1987) into its corresponding decade string (e.g., "1980s").
 */
function getDecade(year: number): string {
  if (year < 1970) return "≤ 1960s";
  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * Filters the master song list based on an array of year/category selections.
 * @param selections - An array of SongSelection objects.
 * @returns A filtered array of Song objects.
 */
export function filterSongs(selections: SongSelection[]): Song[] {
  // If no selections are made, return an empty array. The game logic will handle this.
  if (!selections || selections.length === 0) {
    return [];
  }

  // Group selections by category for efficient lookup.
  // E.g., { 'Pop' => Set(['1980s', '1990s']), 'Rock' => Set(['2000s']) }
  const selectionsByCategory = new Map<string, Set<string>>();
  for (const { category, year } of selections) {
    if (!selectionsByCategory.has(category)) {
      selectionsByCategory.set(category, new Set<string>());
    }
    selectionsByCategory.get(category)!.add(year);
  }

  const filteredSongs = (allSongs as Song[]).filter(song => {
    const songDecade = getDecade(song.year);
    const songCategories = song.categories || [];

    // Check if the song's category and decade match any of the selections.
    for (const songCategory of songCategories) {
      if (selectionsByCategory.has(songCategory)) {
        const selectedYears = selectionsByCategory.get(songCategory)!;
        if (selectedYears.has(songDecade)) {
          return true; // Found a match, include this song.
        }
      }
    }
    return false; // No match found for this song.
  });

  return filteredSongs;
}