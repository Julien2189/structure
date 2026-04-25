const url = "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=90";

function formaterDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("fr-FR");
}

async function afficheCrypto() {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Erreur HTTP ${response.status}`);
    }

    const prix = await response.json();

    const valeurs = [];

    for (let i = 0; i < prix.length; i++) {
      const [
        openTime,
        open,
        high,
        low,
        closePrice,
        volume,
        closeTime,
        quoteVolume,
        trades,
        takerBuyBaseVolume,
        takerBuyQuoteVolume
      ] = prix[i];

      valeurs.push({
        openTime: formaterDate(openTime),
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(closePrice),
        volume: parseFloat(volume),
        closeTime: formaterDate(closeTime),
        quoteVolume: parseFloat(quoteVolume),
        trades: Number(trades),
        takerBuyBaseVolume: parseFloat(takerBuyBaseVolume),
        takerBuyQuoteVolume: parseFloat(takerBuyQuoteVolume)
      });
    }

    console.log(valeurs);

  } catch (error) {
    console.error("Erreur :", error);
  }
}

afficheCrypto();