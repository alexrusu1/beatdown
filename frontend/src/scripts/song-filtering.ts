import type { Song, SongSelection } from '../game.logic/engine';
import allSongs from '../data/songs.json';

/**
 * Converts a year (e.g., 1987) into its corresponding decade string (e.g., "1980s").
 */
function getDecade(year: number): string {
  return `${Math.floor(year / 10) * 10}s`;
}

/**
 * Filters the master song list based on an array of year/category selections.
 * @param selections - An array of SongSelection objects.
 * @returns A filtered array of Song objects.
 */
export function filterSongs(selections: SongSelection[]): Song[] {
  if (!selections || selections.length === 0 || (selections.length === 1 && selections[0].year === 'All' && selections[0].category === 'All')) {
    return allSongs as Song[];
  }

  const songSet = new Set<Song>();
  for (const selection of selections) {
    for (const song of allSongs) {
      const songDecade = getDecade(song.year);
      const songCategories = song.categories || [];
      const yearMatch = selection.year === 'All' || songDecade === selection.year;
      const categoryMatch = selection.category === 'All' || songCategories.some(c => c === selection.category);
      if (yearMatch && categoryMatch) {
        songSet.add(song as Song);
      }
    }
  }
  return Array.from(songSet);
}