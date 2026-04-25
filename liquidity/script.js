
  const DOM = {
    assetSelect: document.getElementById('assetSelect'),
    currentPrice: document.getElementById('currentPrice'),
    priceChange: document.getElementById('priceChange'),
    statusDot: document.getElementById('statusDot'),
    statusText: document.getElementById('statusText'),
    btnLoad: document.getElementById('btnLoad'),
    btnPredict: document.getElementById('btnPredict'),
    chartContainer: document.getElementById('chartContainer'),
    chartPlaceholder: document.querySelector('.chart-placeholder'),
    priceChart: document.getElementById('priceChart'),
    progressSection: document.getElementById('progressSection'),
    progressFill: document.getElementById('progressFill'),
    progressLabel: document.getElementById('progressLabel'),
    logPanel: document.getElementById('logPanel'),
    logContent: document.getElementById('logContent'),
    predictionPanel: document.getElementById('predictionPanel'),
    predictionValue: document.getElementById('predictionValue'),
    predictionMeta: document.getElementById('predictionMeta'),
    timeframeBtns: document.querySelectorAll('.timeframe-btn'),
    
  };
  const actif = document.getElementById('actif') ;
  const action = document.getElementById('action') ; 
  const forex = document.getElementById('forex') ; 

  let close = [];
  let labels = [];
  let periode = 30;
  let chartInstance = null;

  function setStatus(mode, text) {
    DOM.statusDot.classList.remove('ready', 'loading', 'error');
    DOM.statusDot.classList.add(mode);
    DOM.statusText.textContent = text;
  }

  function addLog(message, type = '') {
    DOM.logPanel.classList.add('visible');

    const line = document.createElement('div');
    line.className = 'log-line';

    if (type === 'epoch') {
      line.innerHTML = message;
    } else {
      line.textContent = message;
    }

    DOM.logContent.appendChild(line);

    // défilement automatique
    DOM.logPanel.scrollTop = DOM.logPanel.scrollHeight;
  }

  function clearLogs() {
    DOM.logContent.innerHTML = '';
  }

  function resetProgress(totalEpochs = 200) {
    DOM.progressSection.classList.add('visible');
    DOM.progressFill.style.width = '0%';
    DOM.progressLabel.textContent = `Entraînement — Epoch 0 / ${totalEpochs}`;
  }

  function renderChart(chartLabels, chartData) {
    if (chartInstance) {
      chartInstance.destroy();
    }

    DOM.chartPlaceholder.style.display = 'none';
    DOM.priceChart.style.display = 'block';

    const ctx = DOM.priceChart.getContext('2d');

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: chartLabels,
        datasets: [
          {
            label: 'Prix de clôture',
            data: chartData,
            borderColor: '#00f0ff',
            backgroundColor: 'rgba(0, 240, 255, 0.08)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: 0.25,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: {
            labels: {
              color: '#e0e8ff',
              font: {
                family: 'Rajdhani'
              }
            }
          },
          tooltip: {
            backgroundColor: 'rgba(10, 14, 30, 0.95)',
            titleColor: '#00f0ff',
            bodyColor: '#e0e8ff',
            borderColor: 'rgba(0, 240, 255, 0.25)',
            borderWidth: 1
          }
        },
        scales: {
          x: {
            ticks: {
              color: '#5a6480',
              maxTicksLimit: 8
            },
            grid: {
              color: 'rgba(255,255,255,0.04)'
            }
          },
          y: {
            ticks: {
              color: '#5a6480'
            },
            grid: {
              color: 'rgba(255,255,255,0.04)'
            }
          }
        }
      }
    });
  }

  DOM.assetSelect.style.display= "block" ; 
        action.style.display ="none" ;
        forex.style.display = "none" ;
  actif.addEventListener('change' ,()=>{
    if(actif.value === "crypto" ) {
        DOM.assetSelect.style.display= "block" ; 
        action.style.display ="none" ;
        forex.style.display = "none" ;
    } 
  
       
      if  (actif.value === "action") {
      action.style.display = "block" ;
        DOM.assetSelect.style.display= "none" ; 
            forex.style.display = "none" ;


      
    }

    else if(actif.value === "forex") {
      forex.style.display = "block" ;
        action.style.display = "none" ;
        DOM.assetSelect.style.display= "none" ; 
    }
  });
  DOM.assetSelect.addEventListener('change', () => {
    affichePrix(DOM.assetSelect.value);
  });



  async function affichePrix(crypto) {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${crypto}`);
      const data = await response.json();

      if (!data.price) {
        throw new Error('Prix introuvable');
      }

      const prix = Number(data.price).toFixed(3);
      DOM.currentPrice.innerHTML = `${prix}<span class="currency"> USDT</span>`;

      return data;
    } catch (error) {
      console.error(error);
      DOM.currentPrice.innerHTML = `Erreur<span class="currency"> USDT</span>`;
      setStatus('error', 'Erreur prix');
      return null;
    }
  }

  setInterval(() => {
    affichePrix(DOM.assetSelect.value);
  }, 2000);

  affichePrix(DOM.assetSelect.value);

  DOM.timeframeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      DOM.timeframeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      periode = Number(btn.dataset.period);
      setStatus('ready', `Période ${btn.textContent}`);
    });
  });

  async function recuperePrix(crypto, temp) {
    try {
      const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=${crypto}&interval=1d&limit=${temp}`);
      const data = await response.json();

      if (!Array.isArray(data)) {
        throw new Error('Réponse Binance invalide');
      }

      return data;
    } catch (error) {
      console.error(error);
      setStatus('error', 'Erreur chargement');
      addLog(`Erreur de récupération des données : ${error.message}`);
      return [];
    }
  }

  function formaterDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  }

  DOM.btnLoad.addEventListener('click', async () => {
    setStatus('loading', 'Chargement...');
    clearLogs();
    addLog(`Chargement des données pour ${DOM.assetSelect.value} sur ${periode} jours...`);

    close = [];
    labels = [];

    DOM.predictionPanel.classList.remove('visible');
    DOM.progressSection.classList.remove('visible');
    DOM.progressFill.style.width = '0%';

    const prix = await recuperePrix(DOM.assetSelect.value, periode);

    if (!prix.length) {
      setStatus('error', 'Aucune donnée');
      addLog('Aucune donnée reçue.');
      return;
    }

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

    close = valeurs.map(v => v.close);
    labels = valeurs.map(v => v.closeTime);

    renderChart(labels, close);

    addLog(`Données chargées : ${close.length} points.`);
    addLog(`Graphique affiché pour ${DOM.assetSelect.value}.`);
    setStatus('ready', 'Données prêtes');
  });

  DOM.btnPredict.addEventListener('click', async () => {
    if (close.length < 2) {
      clearLogs();
      addLog("Charge d'abord les données.");
      DOM.logPanel.classList.add('visible');
      setStatus('error', 'Pas de données');
      return;
    }

    const totalEpochs = 500;

    clearLogs();
    resetProgress(totalEpochs);
    DOM.predictionPanel.classList.remove('visible');
    DOM.logPanel.classList.add('visible');

    addLog(`Préparation du modèle pour ${DOM.assetSelect.value}...`);
    addLog(`Début de l'entraînement sur ${close.length} valeurs.`);
    setStatus('loading', 'Entraînement...');

    const xsData = close.slice(0, -1);
    const ysData = close.slice(1);

    const xs = tf.tensor2d(xsData, [xsData.length, 1]);
    const ys = tf.tensor2d(ysData, [ysData.length, 1]);

    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape: [1] }));
    model.add(tf.layers.dense({ units: 8, activation: 'relu' }));
    model.add(tf.layers.dense({ units: 1, activation: 'linear' }));

    model.compile({
      optimizer: 'adam',
      loss: 'meanSquaredError'
    });

    try {
      await model.fit(xs, ys, {
        epochs: totalEpochs,
        callbacks: {
          onTrainBegin: async () => {
            addLog('Entraînement lancé...');
            await tf.nextFrame();
          },

          onEpochEnd: async (epoch, logs) => {
            const currentEpoch = epoch + 1;
            const progress = (currentEpoch / totalEpochs) * 100;

            DOM.progressFill.style.width = `${progress}%`;
            DOM.progressLabel.textContent = `Entraînement — Epoch ${currentEpoch} / ${totalEpochs}`;

            addLog(
              `<span class="log-epoch">Epoch ${currentEpoch}</span> — <span class="log-loss">Loss: ${logs.loss.toFixed(6)}</span>`,
              'epoch'
            );

            setStatus('loading', `Epoch ${currentEpoch}/${totalEpochs}`);
            await tf.nextFrame();
          },

          onTrainEnd: async () => {
            addLog("Entraînement terminé.");
            await tf.nextFrame();
          }
        }
      });

      const lastClose = close[close.length - 1];
      const input = tf.tensor2d([lastClose], [1, 1]);

      const pred = model.predict(input);
      const valeurPredite = pred.dataSync()[0];

      DOM.predictionPanel.classList.add('visible');
      DOM.predictionValue.textContent = `${valeurPredite.toFixed(2)} USDT`;
      DOM.predictionMeta.textContent =
        `Modèle : Dense 16→8→1 · ${totalEpochs} epochs · Dernière clôture : ${lastClose.toFixed(2)} USDT`;

      addLog(`Dernière clôture : ${lastClose.toFixed(2)} USDT`);
      addLog(`Prédiction J+1 : ${valeurPredite.toFixed(2)} USDT`);

      setStatus('ready', 'Prédiction prête');

      pred.dispose();
      input.dispose();
    } catch (error) {
      console.error(error);
      addLog(`Erreur pendant l'entraînement : ${error.message}`);
      setStatus('error', 'Erreur modèle');
    } finally {
      xs.dispose();
      ys.dispose();
    }
  });
