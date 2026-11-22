import { ragConfig } from "../src/rag/config.ts";
import { splitAgentically } from "../src/rag/vector/agentic-chunk.ts";

const sample = [
  "Photosynthesis is the process plants use to turn light into chemical energy. Chlorophyll in the leaves absorbs sunlight. Water and carbon dioxide become glucose and oxygen. This conversion happens in the chloroplast and is the reason green plants release oxygen into the air.",
  "The light reactions happen in the thylakoid membrane. They produce ATP and NADPH, which the Calvin cycle later spends. Excited electrons move through the photosystems and split water, which is where the oxygen comes from.",
  "The Calvin cycle fixes carbon dioxide into sugar. Rubisco is the enzyme that captures the carbon. The cycle turns several times to build one molecule of glucose, and it does not need light directly once ATP and NADPH are available.",
  "The French Revolution began in 1789. The Estates General met at Versailles because the crown was bankrupt. Harvest failures and the price of bread had already made Paris restless, and the tax system fell almost entirely on the Third Estate.",
  "The storming of the Bastille on 14 July 1789 became the symbol of the revolution. Louis XVI was later tried and executed. The monarchy's attempt to flee to Varennes destroyed what trust remained between the king and the assembly.",
  "The National Assembly abolished feudal privileges and published the Declaration of the Rights of Man. Those articles said that law is the expression of the general will and that offices should be open to every citizen.",
].join("\n\n");

async function main(): Promise<void> {
  const pieces = await splitAgentically(sample, "sample");
  console.log(`chars=${sample.length}`);
  console.log(`model=${ragConfig.openai.chunkModel}`);
  console.log(`agentic=${ragConfig.vector.agentic}`);
  console.log(`chunks=${pieces.length}`);
  for (const piece of pieces) {
    console.log(`--- ${piece.title} (${piece.text.length} chars)`);
    console.log(piece.text.slice(0, 140).replaceAll("\n", " "));
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
