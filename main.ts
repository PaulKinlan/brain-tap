/**
 * Brain Tap — static file server for Deno Deploy.
 *
 * Serves the static site from ./public. Deno Deploy injects PORT and expects
 * the server to bind 0.0.0.0; Deno.serve handles both, with 8000 for local dev.
 *
 * Run locally:  deno task dev
 */

import { serveDir } from "jsr:@std/http/file-server";

const port = Number(Deno.env.get("PORT")) || 8000;

Deno.serve({ port }, (req) =>
  serveDir(req, {
    fsRoot: "public",
    quiet: true,
  }));
