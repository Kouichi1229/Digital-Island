import "dotenv/config";
import express from "express";
import cors from "cors";
import { loadLumiConfig } from "./lumi/config/lumi-config";
import {
  completeLumiAction,
  getLumiControllerState,
  recoverLumiController,
  requestLumiAction,
} from "./lumi/lumi-controller";

// Validate Lumi queue configuration before creating or starting the server.
loadLumiConfig();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "digital-island-server",
  });
});

app.get("/api/lumi/state", (_req, res) => {
  res.json({
    state: getLumiControllerState(),
  });
});

app.post("/api/lumi/decide", async (req, res) => {
  const { observation } = req.body ?? {};

  if (typeof observation !== "string" || observation.length === 0) {
    res.status(400).json({
      error: "A valid observation string is required",
    });
    return;
  }

  try {
    const action = await requestLumiAction(observation);
    res.json(action);
  } catch (error) {
    console.error("Lumi decision failed:", error);

    res.status(503).json({
      error: error instanceof Error ? error.message : "Lumi decision failed",
      state: getLumiControllerState(),
    });
  }
});

app.post("/api/lumi/complete", (req, res) => {
  const { actionId } = req.body ?? {};

  if (typeof actionId !== "string" || actionId.length === 0) {
    res.status(400).json({
      error: "A valid actionId is required",
    });
    return;
  }

  try {
    completeLumiAction(actionId);

    res.json({
      success: true,
      state: getLumiControllerState(),
    });
  } catch (error) {
    res.status(409).json({
      error:
        error instanceof Error ? error.message : "Action completion rejected",
      state: getLumiControllerState(),
    });
  }
});

app.post("/api/lumi/recover", async (_req, res) => {
  try {
    await recoverLumiController();

    res.json({
      success: true,
      state: getLumiControllerState(),
    });
  } catch (error) {
    res.status(503).json({
      error: error instanceof Error ? error.message : "Lumi recovery failed",
      state: getLumiControllerState(),
    });
  }
});

app.listen(PORT, () => {
  console.log(`DigitalIsland server running at http://localhost:${PORT}`);
});
