import { askLumiAI, decideLumiAction } from "./lumi-ai";

async function main() {
  const observation = JSON.stringify({
    gameTime: "06:00",
    lumi: {
      x: 640,
      y: 480,
      direction: "south",
      isMoving: false,
    },
    environment: {
      radius: 96,
      nearbyTiles: [],
    },
  });

  console.log("正在測試 Lumi 自主行為決策...");

  try {
    const action = await decideLumiAction(observation);

    console.log("\nLumi 的行動決策：");
    console.log(JSON.stringify(action, null, 2));
  } catch (error) {
    console.error("Lumi 行為決策失敗：", error);
    process.exitCode = 1;
  }

  console.log("\n正在測試 Lumi 自然語言回應...");

  try {
    const result = await askLumiAI(observation);

    console.log("\nLumi 的回應：");
    console.log(result.content);
  } catch (error) {
    console.error("Lumi AI 呼叫失敗：", error);
    process.exitCode = 1;
  }
}

main();
