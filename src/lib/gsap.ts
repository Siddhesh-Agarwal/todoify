import gsap from "gsap";
import { useGSAP } from "@gsap/react";

// GSAP's registerPlugin wakes the ticker, which calls requestAnimationFrame /
// setTimeout. Those are disallowed in Cloudflare Workers global (module) scope,
// so registration must be deferred to the client only.
if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP);
}

export { gsap, useGSAP };
