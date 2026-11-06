/**
 * Parasal Değer (Kuruş) Modülü
 * Yuvarlama hatalarını (IEEE 754 float) tamamen önlemek için
 * tüm parasal tutarlar veritabanında ve hesaplamalarda tam sayı (kuruş) olarak tutulur.
 * Örn: 245,00 TL -> 24500 kuruş.
 */

export function assertValidKurus(amountKurus: number, fieldName = "Tutar"): void {
  if (!Number.isInteger(amountKurus) || !Number.isSafeInteger(amountKurus) || amountKurus < 0) {
    throw new Error(`${fieldName} negatif olmayan bir tam sayı (kuruş) olmalıdır. Alınan: ${amountKurus}`);
  }
}

export function assertPositiveKurus(amountKurus: number, fieldName = "Fiyat"): void {
  if (!Number.isInteger(amountKurus) || !Number.isSafeInteger(amountKurus) || amountKurus <= 0) {
    throw new Error(`${fieldName} sıfırdan büyük bir tam sayı (kuruş) olmalıdır. Alınan: ${amountKurus}`);
  }
}

/**
 * Kuruş tam sayısını Türkçe para birimi formatına çevirir.
 * Örn: 24500 -> "245,00 ₺"
 */
export function formatKurus(amountKurus: number): string {
  const safe = Math.round(amountKurus);
  const sign = safe < 0 ? "-" : "";
  const abs = Math.abs(safe);
  const lira = Math.floor(abs / 100);
  const kurus = abs % 100;
  const liraFormatted = lira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const kurusFormatted = kurus.toString().padStart(2, "0");
  return `${sign}${liraFormatted},${kurusFormatted} ₺`;
}

/**
 * TL cinsinden girilen metin veya sayıyı güvenli şekilde kuruş tam sayısına dönüştürür.
 * Örn: "245.50" veya "245,50" veya 245.5 -> 24550
 */
export function parseTlToKurus(input: string | number): number {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input < 0) {
      throw new Error("Geçersiz TL tutarı.");
    }
    return Math.round(input * 100);
  }
  const cleaned = input.trim().replace(/\s/g, "").replace("₺", "");
  if (!cleaned) {
    throw new Error("Tutar boş olamaz.");
  }
  // Türkçe format (örn. "1.250,50") veya standart ondalık ("245.50" / "245,50")
  let normalized = cleaned;
  if (normalized.includes(",") && normalized.includes(".")) {
    normalized = normalized.replace(/\./g, "").replace(",", ".");
  } else if (normalized.includes(",")) {
    normalized = normalized.replace(",", ".");
  }
  const num = Number(normalized);
  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Geçersiz para formatı: ${input}`);
  }
  return Math.round(num * 100);
}
