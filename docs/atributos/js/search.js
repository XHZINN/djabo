document.addEventListener('DOMContentLoaded', function () {

    const popularCPUs = [
    "Intel Core i5-10400F",
    "AMD Ryzen 5 3600",
    "Intel Core i7-9700K",
    "AMD Ryzen 7 5800X",
    "Intel Core i3-12100F",
    "AMD Ryzen 5 5600X",
    "Intel Core i5-12400F",
    "AMD Ryzen 9 5900X",
    "Intel Core i9-9900K",
    "AMD Ryzen 3 3100"
    ];

    const popularGPUs = [
    "GeForce RTX 3060",
    "Radeon RX 6800",
    "GeForce RTX 4090",
    "GeForce GTX 1650",
    "Radeon RX 580",
    "GeForce GTX 1050 Ti",
    "GeForce RTX 2060",
    "Radeon RX 6600",
    "GeForce RTX 3050 8 GB",
    "Radeon RX 5500"
    ];

    const popularRam = [
        "4 GB",
        "8 GB",
        "16 GB",
        "32 GB"
    ]


  function setupAutocomplete(inputId, suggestionsId, dataPromise, options = {}, popularItems = []) {
    let items = [];

    dataPromise.then(data => {
      items = data;
      console.log(`Dados carregados para ${inputId}:`, items);
    });

    const input = document.getElementById(inputId);
    const suggestions = document.getElementById(suggestionsId);

    if (!input || !suggestions) {
      console.error(`Elementos não encontrados: ${inputId} ou ${suggestionsId}`);
      return;
    }

    function normalize(str) {
      return str.toLowerCase().replace(/[\s\-]/g, '');
    }

    input.addEventListener('focus', () => {
    if (input.value.trim() === '') {
        suggestions.innerHTML = '';
        if (popularItems && popularItems.length > 0) {
        popularItems.slice(0, 10).forEach(item => {
            const li = document.createElement('li');
            li.textContent = item;
            li.addEventListener('click', () => {
            input.value = item;
            suggestions.innerHTML = '';
            });
            suggestions.appendChild(li);
        });
        }
    } else {
        input.dispatchEvent(new Event('input'));
    }
    });


    input.addEventListener('input', () => {
      const value = input.value;
      const normValue = normalize(value);
      suggestions.innerHTML = '';

      const matches = items.filter(item => {
        let target = '';

        if (options.isObject && options.fieldName) {
          target = item[options.fieldName] || '';
        } else {
          target = item;
        }

        return normalize(target).includes(normValue);
      });

      matches.slice(0, 10).forEach(item => {
        const displayText = options.isObject ? item[options.fieldName] : item;

        const li = document.createElement('li');
        li.textContent = displayText;

        li.addEventListener('click', () => {
          input.value = displayText;
          suggestions.innerHTML = '';
        });

        suggestions.appendChild(li);
      });
    });
  }

  // JSON de CPUs = objetos com "Name"
  const cpuPromise = fetch('atributos/JSONs/cpu_power.json')
    .then(res => res.json())
    .catch(err => console.error('Erro ao carregar cpu_power.json', err));

  // JSON de GPUs = lista de strings
  const gpuPromise = fetch('atributos/JSONs/all_gpus.json')
    .then(res => res.json())
    .catch(err => console.error('Erro ao carregar all_gpus.json', err));

  // JSON de RAM = Lista de strings
  const ramPromise = fetch('atributos/JSONs/ram.json')
    .then(res => res.json())
    .catch(err => console.error('erro ao carregar ram.json', err));

  // JSON de SO = Lista de strings
  const soPromise = fetch('atributos/JSONs/so.json')
    .then(res => res.json())
    .catch(err => console.error('erro ao carregar so.json', err));

  setupAutocomplete('cpu-input-min', 'cpu-suggestions-min', cpuPromise, {
    isObject: true,
    fieldName: 'Name'
  }, popularCPUs);

  setupAutocomplete('cpu-input-rec', 'cpu-suggestions-rec', cpuPromise, {
    isObject: true,
    fieldName: 'Name'
  }, popularCPUs);

  setupAutocomplete('gpu-input-min', 'gpu-suggestions-min', gpuPromise, {}, popularGPUs);

  setupAutocomplete('gpu-input-rec', 'gpu-suggestions-rec', gpuPromise, {}, popularGPUs);

  setupAutocomplete('ram-input-min', 'ram-suggestions-min', ramPromise, {}, popularRam);

  setupAutocomplete('ram-input-rec', 'ram-suggestions-rec', ramPromise, {}, popularRam);

  setupAutocomplete('so-input-min', 'so-suggestions-min', soPromise);

  setupAutocomplete('so-input-rec', 'so-suggestions-rec', soPromise);
});
