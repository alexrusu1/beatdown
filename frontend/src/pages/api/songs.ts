export const prerender = false;
import type { APIRoute } from 'astro';
import { readFileSync } from 'fs';
import { join } from 'path';

// Helper used by GET/POST for actual filtering
function filterSongsByCategories(songsData: any[], categories: string[]) {
  if (categories.length === 0) return songsData;
  return songsData.filter((song: any) => {
    if (!song.categories || song.categories.length === 0) return false;
    return song.categories.some((cat: string) => {
      const lowerCat = cat.toLowerCase();
      if (lowerCat === 'rap' || lowerCat === 'hip-hop/rap' || lowerCat === 'hip-hop') {
        return categories.includes('hiphop');
      }
      if (lowerCat === 'r&b/soul') {
        return categories.includes('rnb');
      }
      if (lowerCat === 'dance' || lowerCat === 'electronic' || lowerCat === 'edm') {
        return categories.includes('dance');
      }
      if (lowerCat.includes('alternative') || lowerCat.includes('alt') || lowerCat.includes('indie')) {
        return categories.includes('alternative');
      }
      if (lowerCat === 'pop') {
        return categories.includes('pop');
      }
      return false;
    });
  });
}

// common logic to load songs data once
const songsPath = join(process.cwd(), 'src', 'data', 'songs.json');
const songsData: any[] = JSON.parse(readFileSync(songsPath, 'utf-8'));

export const GET: APIRoute = async ({ url }) => {
  // attempt to read categories from query in case it ever works
  const categories = url.searchParams.get('categories')?.split(',').map(s => s.trim()).filter(Boolean) || [];
  console.log('GET categories (query):', categories);
  const filtered = filterSongsByCategories(songsData, categories);
  return new Response(JSON.stringify(filtered), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request }) => {
  let categories: string[] = [];
  try {
    const body = await request.json();
    if (body && Array.isArray(body.categories)) {
      categories = body.categories.map((c: any) => String(c).trim()).filter(Boolean);
    }
  } catch (e) {
    console.warn('POST /api/songs failed to parse JSON body', e);
  }
  console.log('POST categories:', categories);
  const filtered = filterSongsByCategories(songsData, categories);
  return new Response(JSON.stringify(filtered), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};