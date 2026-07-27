import { join } from "path";
import pino from "pino";

export const logger = pino({
  level: "info",
  transport: {
    targets: [
      {
        target: "pino-pretty",
        options: { colorize: true },
        level: "info"
      },
      {
        target: "pino/file",
        options: { destination: join(process.cwd(), "src/logs/app.log"), mkdir: true, },
        level: "info"
      }
    ]
  }
});
