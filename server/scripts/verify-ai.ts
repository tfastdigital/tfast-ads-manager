/**
 * Live AI provider verification — tests OpenAI, DeepSeek and embeddings
 * with the keys in .env. Fails loudly with the underlying error so key
 * problems are diagnosable.
 * Run: npx tsx scripts/verify-ai.ts
 */
import { complete, embedText, providerModel } from '../src/providers/router.js';

async function main(): Promise<void> {
  // 1. OpenAI (orchestration tier)
  try {
    const res = await complete({
      task: 'orchestration',
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    });
    console.log(`✅ OpenAI (${providerModel('openai')}) → "${res.choices[0]?.message?.content?.trim()}"`);
  } catch (err) {
    console.log(`❌ OpenAI: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2. DeepSeek (bulk tier)
  try {
    const res = await complete({
      task: 'classification',
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
    });
    console.log(`✅ DeepSeek (${providerModel('deepseek')}) → "${res.choices[0]?.message?.content?.trim()}"`);
  } catch (err) {
    console.log(`❌ DeepSeek: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Embeddings (memory)
  try {
    const v = await embedText('creative fatigue test');
    console.log(`✅ Embeddings → ${v.length} dimensions, first: ${v[0].toFixed(6)}`);
  } catch (err) {
    console.log(`❌ Embeddings: ${err instanceof Error ? err.message : String(err)}`);
  }
}

main();
