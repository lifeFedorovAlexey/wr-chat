import { startServer } from "./app.mjs";
import { applyConfigToProcessEnv, readConfig } from "./lib/config.mjs";

const config = readConfig(process.env);
applyConfigToProcessEnv(config, process.env);

startServer({
  host: config.host,
  port: config.port,
});
