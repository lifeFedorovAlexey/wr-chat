import { startServer } from "./app.mjs";
import { readConfig } from "./lib/config.mjs";

const config = readConfig(process.env);

startServer({
  host: config.host,
  port: config.port,
});
