// OpenNext Cloudflare Pages adapter configuration
export default {
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
