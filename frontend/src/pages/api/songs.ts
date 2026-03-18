export const prerender = false;
import type { APIRoute } from 'astro';
import songsData from '../../data/songs.json';

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
      if (lowerCat === 'r&b/soul' || lowerCat === 'r&b' || lowerCat === 'soul') {
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
      if (lowerCat === 'rock' || lowerCat === 'soft rock' || lowerCat === 'hard rock') {
        return categories.includes('rock');
      }
      return false;
    });
  });
}

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