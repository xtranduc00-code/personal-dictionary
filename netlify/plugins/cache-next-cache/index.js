/**
 * Persist Next.js webpack cache between Netlify builds (large win on cold builds).
 * @see https://docs.netlify.com/build/configure-builds/build-plugins/
 */
module.exports = {
  async onPreBuild({ utils }) {
    const ok = await utils.cache.restore(".next/cache");
    if (ok) {
      console.log("[cache-next-cache] Restored .next/cache");
    }
  },
  async onPostBuild({ utils }) {
    await utils.cache.save(".next/cache");
    console.log("[cache-next-cache] Saved .next/cache");
  },
};
