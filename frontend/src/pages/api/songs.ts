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
      if (lowerCat === 'pop' && categories.includes('dance')) {
        const danceHits = [
          'uptown funk', 'happy', 'can\'t stop the feeling', 'shake it off',
          'blinding lights', 'don\'t start now', 'levitating', 'good 4 u',
          'butter', 'permission to dance', 'butterfly', 'dynamite',
          'dancing queen', 'stayin alive', 'i wanna dance with somebody',
          'billie jean', 'thriller', 'beat it', 'bad', 'smooth criminal',
          'black or white', 'remember the time', 'you are not alone',
          'earth song', 'they don\'t care about us', 'blood on the dance floor',
          'ghost', 'heartbreaker', 'invincible', 'you rock my world',
          'cry', 'whatever happens', 'unbreakable', 'xscape',
          'michael jackson', 'mj', 'jackson 5', 'abc', 'i want you back',
          'the love you save', 'signed sealed delivered', 'superstition',
          'sir duke', 'i wish', 'part time lover', 'overjoyed', 'lately',
          'just a fool', 'do i do', 'ordinary pain', 'sweet love',
          'is it you', 'strawberry letter 23', 'i can\'t stand it',
          'stevie wonder', 'wonder', 'marvin gaye', 'let\'s get it on',
          'sexual healing', 'heard it through the grapevine', 'what\'s going on',
          'inner city blues', 'trouble man', 'save the children',
          'whats going on', 'mercy mercy me', 'i heard it through the grapevine'
        ];
        const songTitle = song.displayName.toLowerCase();
        const songArtist = song.displayArtists ? song.displayArtists.toLowerCase() : '';
        return danceHits.some(hit => songTitle.includes(hit) || songArtist.includes(hit));
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