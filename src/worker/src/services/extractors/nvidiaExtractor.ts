import OpenAI from "openai";
import { Extractor, ExtractedFields } from "@docflow/shared";
import { config } from "../../config";

const client = new OpenAI({
  baseURL: config.nvidia.apiUrl,
  apiKey: config.nvidia.apiKey,
});

const MODEL = "nvidia/nemotron-3-nano-30b-a3b";

const SYSTEM_PROMPT = `Sen bir fatura/fiş verisi çıkarma asistanısın. Sana verilen OCR metninden
alanları çıkar ve SADECE şu JSON şemasına uyan bir obje döndür, başka hiçbir metin ekleme:

{
  "documentType": string,
  "issueDate": string | null,   // ISO 8601 tarih, örn. "2026-03-15"
  "amount": number | null,       // KDV/vergi DAHİL genel toplam (ara toplam değil)
  "currency": string | null,    // ISO 4217, örn. "TRY"
  "vendor": string | null,
  "summary": string | null      // tek cümlelik kısa özet
}

"amount" için her zaman vergiler dahil GENEL TOPLAM'ı kullan (ara toplam, KDV hariç tutar
gibi ara değerleri DEĞİL). Belgede birden fazla toplam varsa en sonuncusu/en büyüğü genellikle
genel toplamdır.

Bir alanı metinde bulamazsan null yaz, ASLA tahmin etme veya uydurma.`;

export const nvidiaExtractor: Extractor = {
  async extract(text: string): Promise<ExtractedFields> {
    const completion = await client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
      temperature: 0,
      max_tokens: 1024,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) {
      throw new Error("NVIDIA API boş cevap döndürdü");
    }

    return JSON.parse(raw) as ExtractedFields;
  },
};