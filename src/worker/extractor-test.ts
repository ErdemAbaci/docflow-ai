import { nvidiaExtractor } from "./src/services/extractors/nvidiaExtractor";

const sampleOcrText = `
ABC TİCARET LTD. ŞTİ.
Fatura No: FTR-2026-00458
Tarih: 15.03.2026

Açıklama                Miktar   Birim Fiyat   Tutar
Ofis Malzemesi Seti        3       450.00       1350.00
Kargo Bedeli                1        50.00         50.00

Ara Toplam: 1400.00 TL
KDV (%20): 280.00 TL
GENEL TOPLAM: 1680.00 TL
`;

async function main() {
  console.log("NVIDIA extractor test başlıyor...\n");
  const result = await nvidiaExtractor.extract(sampleOcrText);
  console.log("Sonuç:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((err) => {
  console.error("Hata:", err);
  process.exit(1);
});
