import { Injectable, Singleton } from "hono-forge";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "@/utils/logger";
import { env } from "@/config/env";

interface ProgramFitResponse {
  summary: string;
  score: number;
}

@Injectable()
@Singleton()
export class GeminiService {
  private genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);

  async summarize(text: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `apakah server berjalan normal berdasarkan data ini ${text}`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const geminiResponse = response.text();
      logger.info({ promp: prompt, geminiResponse, response }, "GEMINI");

      return geminiResponse;
    } catch (error) {
      logger.info({ error }, "GEMINI");
      return "";
    }
  }

  async evaluateProgramFit({ userMilestone, programName, programDescription }: {
    programName: string;
    programDescription: string;
    userMilestone: any[];
  }): Promise<ProgramFitResponse> {
    try {
      const model = this.genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const milestoneText = userMilestone.map(
        (m) => ` - Value: "${m.value}", Description: "${m.description}"`
      ).join("\n");

      const prompt = `
        Anda adalah seorang evaluator pendidikan yang ahli dalam menilai kesesuaian program dengan capaian belajar siswa (milestone).

        Tugas Anda adalah menilai seberapa baik program bernama "${programName}" dengan deskripsi: "${programDescription}" cocok dengan milestone siswa berikut:

        Milestone Siswa:
        ${milestoneText}

        Berikan penilaian dalam skor 1-10, di mana:
        - Skor 10: Program sangat sesuai dan relevan dengan semua milestone.
        - Skor 1-5: Program kurang atau tidak sesuai dengan milestone.

        Berikan respons Anda hanya dalam format JSON berikut, tanpa teks atau penjelasan tambahan di luar JSON:

        {
          "summary": "Tulis ringkasan singkat (maksimal 2 kalimat) tentang seberapa cocok program dengan milestone dalam bahasa inggris.",
          "score": 10
        }
        `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const geminiResponse = response.text();
      logger.info({ promp: prompt, geminiResponse, response }, "GEMINI-PROGRAM");

      let jsonResponse: ProgramFitResponse;
      try {
        const responseText = geminiResponse.replace(/```json\n|```/g, "");
        jsonResponse = JSON.parse(responseText);
      } catch (parseError) {
        logger.error({ geminiResponse }, "Gagal parsing JSON dari Gemini");
        return {
          summary: "Gagal memproses respons. Silakan coba lagi atau sesuaikan prompt.",
          score: 0,
        };
      }

      if (jsonResponse.score > 10) jsonResponse.score = 10;
      if (jsonResponse.score < 1) jsonResponse.score = 1;

      return jsonResponse;
    } catch (error) {
      logger.info({ error }, "GEMINI-PROGRAM");
      return {
        summary: "Gagal memproses respons. Silakan coba lagi atau sesuaikan prompt.",
        score: 0,
      };
    }
  }
}
