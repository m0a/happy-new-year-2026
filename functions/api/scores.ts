interface Env {
  DB: D1Database;
}

interface ScoreEntry {
  player_name: string;
  score: number;
  wave: number;
  comment?: string;
  group_id?: string;
}

// GET /api/scores - Get top scores
// POST /api/scores - Submit a new score
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const checkScore = url.searchParams.get('check');
      const groupId = url.searchParams.get('g');

      // Get top 10 scores - filter by group + default if specified, otherwise show default only
      let result;
      if (groupId) {
        // Show group scores + default scores (group_id IS NULL)
        result = await env.DB.prepare(
          'SELECT player_name, score, wave, comment, created_at FROM scores WHERE group_id = ? OR group_id IS NULL ORDER BY score DESC LIMIT 10'
        ).bind(groupId).all();
      } else {
        // Show only default scores (no group)
        result = await env.DB.prepare(
          'SELECT player_name, score, wave, comment, created_at FROM scores WHERE group_id IS NULL ORDER BY score DESC LIMIT 10'
        ).all();
      }

      // If checking score qualification
      let qualifies = true;
      if (checkScore) {
        const scoreNum = parseInt(checkScore, 10);
        if (result.results.length >= 10) {
          const minScore = (result.results[9] as { score: number }).score;
          qualifies = scoreNum > minScore;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        scores: result.results,
        qualifies
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    if (request.method === 'POST') {
      const body = await request.json() as ScoreEntry;
      const { player_name, score, wave, comment, group_id } = body;
      const groupId = group_id || null;

      // Validate input
      if (!player_name || typeof score !== 'number' || typeof wave !== 'number') {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid input'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Sanitize player name (max 20 chars, alphanumeric and basic punctuation)
      const sanitizedName = player_name.slice(0, 20).replace(/[^a-zA-Z0-9\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\s\-_]/g, '');

      if (!sanitizedName) {
        return new Response(JSON.stringify({
          success: false,
          error: 'Invalid player name'
        }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders
          }
        });
      }

      // Sanitize comment (max 100 chars)
      const sanitizedComment = (comment || '').slice(0, 100);

      // Insert score with comment and group
      await env.DB.prepare(
        'INSERT INTO scores (player_name, score, wave, comment, group_id) VALUES (?, ?, ?, ?, ?)'
      ).bind(sanitizedName, score, wave, sanitizedComment, groupId).run();

      // Get rank (within group if specified, otherwise global)
      let rankResult;
      if (groupId) {
        rankResult = await env.DB.prepare(
          'SELECT COUNT(*) as rank FROM scores WHERE group_id = ? AND score > ?'
        ).bind(groupId, score).first() as { rank: number };
      } else {
        rankResult = await env.DB.prepare(
          'SELECT COUNT(*) as rank FROM scores WHERE score > ?'
        ).bind(score).first() as { rank: number };
      }

      const rank = (rankResult?.rank || 0) + 1;

      return new Response(JSON.stringify({
        success: true,
        rank
      }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        ...corsHeaders
      }
    });
  }
};
