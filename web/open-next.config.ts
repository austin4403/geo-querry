// OpenNext Cloudflare Pages adapter configuration
const config = {
  default: {
    override: {
      wrapper: "cloudflare-pages",
      converter: "edge",
      incrementalCache: "dummy",
      tagCache: "dummy",
      queue: "dummy",
    },
  },
};

export default config;
