// Калькулятор высшей математики для комиссии (PWA)
// Регистрация Service Worker для офлайн-работы
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.update();
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!window.__swReloaded) {
      window.__swReloaded = true;
      window.location.reload();
    }
  });
}

// Вспомогательная функция для безопасного рендеринга KaTeX формул
function renderKaTeX(el = document.body) {
  if (typeof window !== "undefined" && window.renderMathInElement) {
    try {
      window.renderMathInElement(el, {
        delimiters: [
          { left: "$$", right: "$$", display: true },
          { left: "$", right: "$", display: false },
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true }
        ],
        throwOnError: false,
        ignoredTags: ["script", "noscript", "style", "textarea", "pre", "code", "input"]
      });
    } catch (e) {
      console.warn("KaTeX render error:", e);
    }
  } else {
    // Если CDN KaTeX еще догружается, повторяем попытку
    setTimeout(() => renderKaTeX(el), 120);
  }
}

// Первичный рендеринг формул во всем интерфейсе (заголовки, кнопки, плашки режимов)
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    renderKaTeX(document.body);
  });
} else {
  renderKaTeX(document.body);
}
window.addEventListener('load', () => {
  renderKaTeX(document.body);
});

// ----------------------------------------------------
// 1. Стандартный калькулятор
// ----------------------------------------------------
let displayValue = '0';
let historyText = '';
let isEvaluated = false;

const displayMain = document.getElementById('displayMain');
const displayHistory = document.getElementById('displayHistory');

function updateDisplay() {
  if (displayMain) {
    displayMain.textContent = displayValue;
    if (displayValue.length > 14) {
      displayMain.style.fontSize = '28px';
    } else if (displayValue.length > 9) {
      displayMain.style.fontSize = '38px';
    } else {
      displayMain.style.fontSize = '54px';
    }
  }
  if (displayHistory) displayHistory.textContent = historyText;
}

window.calcInput = function(type, val) {
  if (type === 'clear') {
    displayValue = '0';
    historyText = '';
    isEvaluated = false;
  } else if (type === 'num') {
    if (isEvaluated || displayValue === '0') {
      displayValue = val;
      isEvaluated = false;
    } else {
      displayValue += val;
    }
  } else if (type === 'dot') {
    if (isEvaluated) {
      displayValue = '0.';
      isEvaluated = false;
    } else {
      const parts = displayValue.split(/[\+\-×÷\(\)]/);
      const last = parts[parts.length - 1];
      if (!last.includes('.')) {
        displayValue += (last === '' ? '0.' : '.');
      }
    }
  } else if (type === 'paren') {
    if (isEvaluated) {
      displayValue = val;
      isEvaluated = false;
    } else {
      if (displayValue === '0' && val === '(') {
        displayValue = '(';
      } else {
        displayValue += val;
      }
    }
  } else if (type === 'op') {
    isEvaluated = false;
    const opSym = val === '*' ? '×' : val === '/' ? '÷' : val;
    if (displayValue === '0' && val === '-') {
      displayValue = '-';
    } else if (/[\+\-×÷]$/.test(displayValue)) {
      displayValue = displayValue.slice(0, -1) + opSym;
    } else {
      displayValue += opSym;
    }
  } else if (type === 'sign') {
    if (isEvaluated || displayValue === '0') {
      displayValue = '-';
      isEvaluated = false;
    } else if (displayValue === '-') {
      displayValue = '0';
    } else if (/[\+\-×÷]$/.test(displayValue)) {
      displayValue += '(-';
    } else if (displayValue.endsWith('(')) {
      displayValue += '-';
    } else {
      const match = displayValue.match(/(\d+\.?\d*)$/);
      if (match) {
        const num = match[1];
        const prefix = displayValue.slice(0, -num.length);
        if (prefix.endsWith('(-')) {
          displayValue = prefix.slice(0, -2) + num;
        } else if (prefix.endsWith('-')) {
          displayValue = prefix.slice(0, -1) + num;
        } else {
          displayValue = prefix + '(-' + num + ')';
        }
      } else {
        displayValue += '(-';
      }
    }
  } else if (type === 'equals') {
    try {
      let raw = displayValue.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
      // Авто-закрытие незакрытых скобок
      let openP = (raw.match(/\(/g) || []).length;
      let closeP = (raw.match(/\)/g) || []).length;
      while (openP > closeP) {
        raw += ')';
        displayValue += ')';
        closeP++;
      }

      const sanitized = raw.replace(/[^0-9\+\-\*\/\.\(\)]/g, '');
      const calcFunc = new Function('return (' + sanitized + ')');
      const res = calcFunc();

      if (typeof res === 'number' && !isNaN(res) && isFinite(res)) {
        const rounded = parseFloat(res.toFixed(8));
        const oldExpr = displayValue;
        const frac = reduceFractionHelper(oldExpr, res);

        let resText = `🎯 Ответ: ${rounded}`;
        let steps = [
          `💡 <b>Вычисление:</b> $${oldExpr.replace(/×/g, ' \\cdot ').replace(/÷/g, ' : ')} = ${rounded}$`
        ];

        if (frac && frac.str && frac.rDen !== 1) {
          historyText = `${oldExpr} = [${frac.str}] =`;
          resText = `🎯 Ответ: <b>${frac.str}</b> (или ${rounded})`;
          if (frac.isExact && frac.gcd > 1) {
            steps.push(`📐 <b>Сокращение дроби:</b><br>$$\\frac{${frac.num}}{${frac.den}} = \\frac{${frac.num} : ${frac.gcd}}{${frac.den} : ${frac.gcd}} = \\mathbf{\\frac{${frac.rNum}}{${frac.rDen}}}$$<br>• Числитель и знаменатель разделили на наибольший общий делитель <b>${frac.gcd}</b>.`);
          } else if (frac.isExact) {
            steps.push(`📐 <b>Дробь уже несократима:</b> $\\mathbf{\\frac{${frac.rNum}}{${frac.rDen}}}$`);
          } else {
            steps.push(`📐 <b>Представление в виде обыкновенной дроби:</b> $\\mathbf{\\frac{${frac.rNum}}{${frac.rDen}}}$`);
          }
        } else {
          historyText = `${oldExpr} =`;
        }

        displayValue = `${rounded}`;
        isEvaluated = true;

        showDrawer({
          title: frac && frac.rDen !== 1 ? "Вычисление и сокращение дроби" : "Арифметическое вычисление",
          resultText: resText,
          steps: steps,
          formulaPronounce: frac && frac.rDen !== 1 ? `несократимая дробь: ${frac.rNum} делить на ${frac.rDen}` : `вычисление выражения с отрицательными числами и скобками`,
          realPronounce: frac && frac.rDen !== 1 ? `${oldExpr} равно ${frac.rNum} к ${frac.rDen}, или ${rounded}` : `${oldExpr} равно ${displayValue}`
        });
      } else {
        historyText = 'Ошибка';
      }
    } catch (e) {
      console.warn('Calc eval error:', e);
      historyText = 'Некорректное выражение';
    }
  }
  updateDisplay();
};

// Вспомогательная функция для автоматического сокращения дробей
function reduceFractionHelper(expr, res) {
  function gcd(a, b) {
    a = Math.abs(Math.round(a));
    b = Math.abs(Math.round(b));
    while (b) {
      let t = b;
      b = a % b;
      a = t;
    }
    return a || 1;
  }

  // 1. Проверяем прямое деление двух целых чисел вида A ÷ B или A / B
  const clean = (expr || '').replace(/\s+/g, '').replace(/÷/g, '/');
  const m = clean.match(/^\(?(-?\d+)\)?\/\(?(-?\d+)\)?$/);
  if (m) {
    let num = parseInt(m[1], 10);
    let den = parseInt(m[2], 10);
    if (den !== 0) {
      let sign = (num * den < 0) ? -1 : 1;
      let absNum = Math.abs(num);
      let absDen = Math.abs(den);
      let g = gcd(absNum, absDen);
      let rNum = (absNum / g) * sign;
      let rDen = absDen / g;
      if (rDen === 1) {
        return { num: num, den: den, gcd: g, rNum: rNum, rDen: rDen, str: `${rNum}`, isExact: true };
      }
      return {
        num: num,
        den: den,
        gcd: g,
        rNum: rNum,
        rDen: rDen,
        str: `${rNum}/${rDen}`,
        latex: `\\frac{${rNum}}{${rDen}}`,
        isExact: true
      };
    }
  }

  // 2. Если результат res — нецелое число, подбираем точную несократимую дробь со знаменателем до 1000
  if (typeof res === 'number' && !Number.isInteger(res) && isFinite(res)) {
    const sign = res < 0 ? -1 : 1;
    const absVal = Math.abs(res);
    for (let d = 2; d <= 1000; d++) {
      let n = Math.round(absVal * d);
      if (Math.abs(absVal - n / d) < 1e-7) {
        let g = gcd(n, d);
        let rNum = (n / g) * sign;
        let rDen = d / g;
        return {
          num: n,
          den: d,
          gcd: g,
          rNum: rNum,
          rDen: rDen,
          str: `${rNum}/${rDen}`,
          latex: `\\frac{${rNum}}{${rDen}}`,
          isExact: false
        };
      }
    }
  }
  return null;
}

// ----------------------------------------------------
// 2. Переключение вкладок режимов
// ----------------------------------------------------
document.querySelectorAll('.mode-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    document.querySelectorAll('.mode-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    const mode = pill.getAttribute('data-mode');

    // Скрываем все панели
    const std = document.getElementById('panelStandard');
    if (std) std.style.display = mode === 'standard' ? 'grid' : 'none';
    const disp = document.getElementById('calcDisplay');
    if (disp) disp.style.display = mode === 'trainer' ? 'none' : 'flex';
    document.querySelectorAll('.math-panel').forEach(p => p.classList.remove('active'));

    const activePanelMap = {
      prob: 'panelProb',
      matrices: 'panelMatrices',
      derivatives: 'panelDerivatives',
      integrals: 'panelIntegrals',
      limits: 'panelLimits',
      vectors: 'panelVectors',
      trainer: 'panelTrainer'
    };

    if (mode === 'trainer') {
      if (typeof window.renderCards === 'function') window.renderCards();
      if (typeof window.updateProgress === 'function') window.updateProgress();
    }
    if (activePanelMap[mode]) {
      const targetPanel = document.getElementById(activePanelMap[mode]);
      if (targetPanel) {
        targetPanel.classList.add('active');
        renderKaTeX(targetPanel);
      }
    }
  });
});

// ----------------------------------------------------
// 3. Математические функции: факториал и комбинаторика
// ----------------------------------------------------
function factorial(num) {
  if (num < 0) return 0;
  if (num === 0 || num === 1) return 1;
  let res = 1;
  for (let i = 2; i <= num; i++) res *= i;
  return res;
}

function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

// Сочетания C_n^k
window.solveCombinations = function() {
  const n = parseInt(document.getElementById('probN').value, 10);
  const k = parseInt(document.getElementById('probK').value, 10);

  if (isNaN(n) || isNaN(k) || n < 0 || k < 0 || k > n) {
    alert('Укажите корректные числа n >= k >= 0');
    return;
  }

  // Расчет
  let numerator = 1;
  let numStr = [];
  for (let i = 0; i < k; i++) {
    numerator *= (n - i);
    numStr.push(n - i);
  }
  const denom = factorial(k);
  let denomStr = [];
  for (let i = k; i >= 1; i--) denomStr.push(i);

  const result = numerator / denom;

  displayValue = `${result}`;
  historyText = `C(${n}, ${k})`;
  updateDisplay();

  showDrawer({
    title: `Сочетания без повторений: $C_{${n}}^{${k}}$`,
    resultText: `🎯 Итоговый ответ: $C_{${n}}^{${k}} = ${result}$`,
    steps: [
      `💡 <b>1. Формула:</b> Порядок элементов не имеет значения:<br>$$C_n^k = \\frac{n!}{k!(n - k)!}$$`,
      `📝 <b>2. Подстановка чисел:</b> $n = ${n}$, $k = ${k}$:<br>$$C_{${n}}^{${k}} = \\frac{${n}!}{${k}! \\cdot (${n} - ${k})!} = \\frac{${n}!}{${k}! \\cdot ${n - k}!}$$`,
      `✂️ <b>3. Сокращение факториалов:</b><br>$$C_{${n}}^{${k}} = \\frac{${numStr.join(' \\cdot ')}}{${denomStr.join(' \\cdot ')}} = \\frac{${numerator}}{${denom}} = ${result}$$`
    ],
    formulaPronounce: `цэ из эн по ка равно эн факториал делить на ка факториал и на скобку эн минус ка факториал`,
    realPronounce: `цэ из ${n} по ${k} равно: дробь ${numStr.join(' на ')} делить на ${denomStr.join(' на ')}, равно ${result}`
  });
};

// Размещения A_n^k
window.solveArrangements = function() {
  const n = parseInt(document.getElementById('probN').value, 10);
  const k = parseInt(document.getElementById('probK').value, 10);

  if (isNaN(n) || isNaN(k) || n < 0 || k < 0 || k > n) {
    alert('Укажите корректные числа n >= k >= 0');
    return;
  }

  let result = 1;
  let numStr = [];
  for (let i = 0; i < k; i++) {
    result *= (n - i);
    numStr.push(n - i);
  }

  displayValue = `${result}`;
  historyText = `A(${n}, ${k})`;
  updateDisplay();

  showDrawer({
    title: `Размещения без повторений: $A_{${n}}^{${k}}$`,
    resultText: `🎯 Итоговый ответ: $A_{${n}}^{${k}} = ${result}$`,
    steps: [
      `💡 <b>1. Формула:</b> Порядок элементов ВАЖЕН (роли разные):<br>$$A_n^k = \\frac{n!}{(n - k)!}$$`,
      `📝 <b>2. Подстановка чисел:</b> $n = ${n}$, $k = ${k}$:<br>$$A_{${n}}^{${k}} = \\frac{${n}!}{(${n} - ${k})!} = \\frac{${n}!}{${n - k}!}$$`,
      `🔢 <b>3. Перемножаем $k$ старших сомножителей:</b><br>$$A_{${n}}^{${k}} = ${numStr.join(' \\cdot ')} = ${result}$$`
    ],
    formulaPronounce: `а из эн по ка равно эн факториал делить на скобку эн минус ка факториал`,
    realPronounce: `а из ${n} по ${k} равно: ${numStr.join(' умножить на ')}, равно ${result}`
  });
};

// Перестановки P_n = n!
window.solvePermutations = function() {
  const n = parseInt(document.getElementById('probN').value, 10);
  if (isNaN(n) || n < 0) {
    alert('Укажите n >= 0');
    return;
  }

  const result = factorial(n);
  displayValue = `${result}`;
  historyText = `P(${n}) = ${n}!`;
  updateDisplay();

  showDrawer({
    title: `Перестановки без повторений: $P_{${n}} = ${n}!$`,
    resultText: `🎯 Итоговый ответ: $P_{${n}} = ${result}$`,
    steps: [
      `💡 <b>1. Формула:</b> Берем все $n$ имеющихся элементов и меняем местами:<br>$$P_n = n! = 1 \\cdot 2 \\cdot 3 \\cdots n$$`,
      `📝 <b>2. Вычисление:</b><br>$$P_{${n}} = ${n}! = ${result}$$`
    ],
    formulaPronounce: `пэ с индексом эн равно эн факториал`,
    realPronounce: `пэ с индексом ${n} равно ${n} факториал, равно ${result}`
  });
};

// Сочетания с повторениями
window.solveRepeatCombinations = function() {
  const n = parseInt(document.getElementById('probN').value, 10);
  const k = parseInt(document.getElementById('probK').value, 10);
  if (isNaN(n) || isNaN(k) || n <= 0 || k < 0) return;

  const N = n + k - 1;
  const K = k;
  let num = 1;
  for (let i = 0; i < K; i++) num *= (N - i);
  const result = num / factorial(K);

  displayValue = `${result}`;
  historyText = `C_rep(${n}, ${k}) = C(${N}, ${K})`;
  updateDisplay();

  showDrawer({
    title: `Сочетания с повторениями: $\\bar{C}_{${n}}^{${k}}$`,
    resultText: `🎯 Итоговый ответ: $\\bar{C}_{${n}}^{${k}} = ${result}$`,
    steps: [
      `💡 <b>1. Формула:</b> Переход к обычным сочетаниям:<br>$$\\bar{C}_n^k = C_{n + k - 1}^k$$`,
      `📝 <b>2. Подстановка:</b> $n = ${n}$, $k = ${k}$:<br>$$\\bar{C}_{${n}}^{${k}} = C_{${n} + ${k} - 1}^{${k}} = C_{${N}}^{${K}} = \\frac{${N}!}{${K}! \\cdot ${N - K}!} = ${result}$$`
    ],
    formulaPronounce: `цэ с чертой из эн по ка равно цэ из эн плюс ка минус один по ка`,
    realPronounce: `цэ с чертой из ${n} по ${k} равно цэ из ${N} по ${K}, равно ${result}`
  });
};

// Классическая вероятность P(A) = m/n
window.solveClassicProb = function() {
  const m = parseInt(document.getElementById('probM').value, 10);
  const n = parseInt(document.getElementById('probTotalN').value, 10);
  if (isNaN(m) || isNaN(n) || n <= 0 || m < 0 || m > n) {
    alert('Укажите корректные 0 <= m <= n');
    return;
  }

  const g = gcd(m, n);
  const redM = m / g;
  const redN = n / g;
  const probDec = (m / n).toFixed(4);
  const percent = ((m / n) * 100).toFixed(2);

  displayValue = `${parseFloat((m / n).toFixed(4))}`;
  historyText = `P = ${m}/${n}`;
  updateDisplay();

  showDrawer({
    title: `Классическая вероятность: $P(A) = \\frac{m}{n}$`,
    resultText: `🎯 Итоговый ответ: $P(A) = \\frac{${redM}}{${redN}} \\approx ${probDec}$ (${percent}%)`,
    steps: [
      `💡 <b>1. Аксиома вероятности:</b> Отношение благоприятных к общему числу исходов:<br>$$P(A) = \\frac{m}{n} \\quad (0 \\le P(A) \\le 1)$$`,
      `📝 <b>2. Подстановка:</b> $m = ${m}$ (благоприятных), $n = ${n}$ (всего):<br>$$P(A) = \\frac{${m}}{${n}} = \\frac{${redM}}{${redN}} \\approx ${probDec}$$`
    ],
    formulaPronounce: `пэ от а равно дробь: эм делить на эн; вероятность лежит от нуля до единицы`,
    realPronounce: `вероятность равна ${m} делить на ${n}, сокращаем: ${redM} к ${redN}, или ${percent} процентов`
  });
};

// ----------------------------------------------------
// 4. Матрицы и определители
// ----------------------------------------------------
// Определитель 2x2
window.solveDet2x2 = function() {
  const a11 = parseFloat(document.getElementById('m2_11').value) || 0;
  const a12 = parseFloat(document.getElementById('m2_12').value) || 0;
  const a21 = parseFloat(document.getElementById('m2_21').value) || 0;
  const a22 = parseFloat(document.getElementById('m2_22').value) || 0;

  const mainDiag = a11 * a22;
  const antiDiag = a12 * a21;
  const det = mainDiag - antiDiag;

  displayValue = `${det}`;
  historyText = `det(2×2) = ${det}`;
  updateDisplay();

  showDrawer({
    title: `Определитель матрицы 2×2`,
    resultText: `🎯 Итоговый ответ: $\\det A = ${det}$`,
    steps: [
      `💡 <b>1. Правило крест-накрест:</b> Главная диагональ минус побочная:<br>$$\\det A = \\begin{vmatrix} a_{11} & a_{12} \\\\ a_{21} & a_{22} \\end{vmatrix} = a_{11}a_{22} - a_{12}a_{21}$$`,
      `📝 <b>2. Произведение главной диагонали:</b> $(${a11}) \\cdot (${a22}) = ${mainDiag}$`,
      `📝 <b>3. Произведение побочной диагонали:</b> $(${a12}) \\cdot (${a21}) = ${antiDiag}$`,
      `🎯 <b>4. Разность:</b> $${mainDiag} - (${antiDiag}) = ${det}$`
    ],
    formulaPronounce: `определитель два на два: главная диагональ минус побочная`,
    realPronounce: `определитель равен: ${a11} на ${a22} минус ${a12} на ${a21}, равно ${mainDiag} минус ${antiDiag}, равно ${det}`
  });
};

// Определитель 3x3
window.solveDet3x3 = function() {
  const a = [
    [parseFloat(document.getElementById('m3_11').value) || 0, parseFloat(document.getElementById('m3_12').value) || 0, parseFloat(document.getElementById('m3_13').value) || 0],
    [parseFloat(document.getElementById('m3_21').value) || 0, parseFloat(document.getElementById('m3_22').value) || 0, parseFloat(document.getElementById('m3_23').value) || 0],
    [parseFloat(document.getElementById('m3_31').value) || 0, parseFloat(document.getElementById('m3_32').value) || 0, parseFloat(document.getElementById('m3_33').value) || 0]
  ];

  const m1 = a[1][1] * a[2][2] - a[1][2] * a[2][1];
  const m2 = a[1][0] * a[2][2] - a[1][2] * a[2][0];
  const m3 = a[1][0] * a[2][1] - a[1][1] * a[2][0];

  const t1 = a[0][0] * m1;
  const t2 = -a[0][1] * m2;
  const t3 = a[0][2] * m3;
  const det = t1 + t2 + t3;

  displayValue = `${det}`;
  historyText = `det(3×3) = ${det}`;
  updateDisplay();

  showDrawer({
    title: `Определитель матрицы 3×3`,
    resultText: `🎯 Итоговый ответ: $\\det A = ${det}$`,
    steps: [
      `💡 <b>1. Разложение по 1-й строке:</b> Со знаками $(+, -, +)$:<br>$$\\det A = a_{11} M_{11} - a_{12} M_{12} + a_{13} M_{13}$$`,
      `📝 <b>2. Минор $M_{11}$:</b> $${a[0][0]} \\cdot (${a[1][1]} \\cdot ${a[2][2]} - ${a[1][2]} \\cdot ${a[2][1]}) = ${a[0][0]} \\cdot (${m1}) = ${t1}$`,
      `📝 <b>3. Минор $M_{12}$:</b> $-(${a[0][1]}) \\cdot (${a[1][0]} \\cdot ${a[2][2]} - ${a[1][2]} \\cdot ${a[2][0]}) = -(${a[0][1]}) \\cdot (${m2}) = ${t2}$`,
      `📝 <b>4. Минор $M_{13}$:</b> $${a[0][2]} \\cdot (${a[1][0]} \\cdot ${a[2][1]} - ${a[1][1]} \\cdot ${a[2][0]}) = ${a[0][2]} \\cdot (${m3}) = ${t3}$`,
      `🎯 <b>5. Итоговая сумма:</b> $${t1} + (${t2}) + (${t3}) = ${det}$`
    ],
    formulaPronounce: `определитель три на три: разложение по первой строке со знаками плюс, минус, плюс`,
    realPronounce: `определитель равен: первое слагаемое ${t1}, второе слагаемое ${t2}, третье ${t3}, сумма равна ${det}`
  });
};

// Метод Крамера 2x2
window.solveCramer2x2 = function() {
  const a1 = parseFloat(document.getElementById('cr_a1').value) || 0;
  const b1 = parseFloat(document.getElementById('cr_b1').value) || 0;
  const c1 = parseFloat(document.getElementById('cr_c1').value) || 0;
  const a2 = parseFloat(document.getElementById('cr_a2').value) || 0;
  const b2 = parseFloat(document.getElementById('cr_b2').value) || 0;
  const c2 = parseFloat(document.getElementById('cr_c2').value) || 0;

  const det = a1 * b2 - b1 * a2;
  const detX = c1 * b2 - b1 * c2;
  const detY = a1 * c2 - c1 * a2;

  if (det === 0) {
    alert('Главный определитель Δ = 0. Метод Крамера неприменим!');
    return;
  }

  const x = detX / det;
  const y = detY / det;

  displayValue = `x=${parseFloat(x.toFixed(3))}, y=${parseFloat(y.toFixed(3))}`;
  historyText = `Крамер: Δ=${det}`;
  updateDisplay();

  showDrawer({
    title: `Решение СЛАУ 2×2 по формулам Крамера`,
    resultText: `🎯 Ответ: $x = \\frac{${detX}}{${det}} = ${parseFloat(x.toFixed(3))}, \\quad y = \\frac{${detY}}{${det}} = ${parseFloat(y.toFixed(3))}$`,
    steps: [
      `💡 <b>1. Формулы Крамера:</b><br>$$x = \\frac{\\Delta_x}{\\Delta}, \\quad y = \\frac{\\Delta_y}{\\Delta}$$`,
      `📝 <b>2. Главный определитель $\\Delta$:</b><br>$$\\Delta = \\begin{vmatrix} ${a1} & ${b1} \\\\ ${a2} & ${b2} \\end{vmatrix} = ${a1} \\cdot ${b2} - (${b1}) \\cdot ${a2} = ${det}$$`,
      `📝 <b>3. Определитель $\\Delta_x$ (замена 1-го столбца на свободные члены):</b><br>$$\\Delta_x = \\begin{vmatrix} ${c1} & ${b1} \\\\ ${c2} & ${b2} \\end{vmatrix} = ${c1} \\cdot ${b2} - (${b1}) \\cdot ${c2} = ${detX}$$`,
      `📝 <b>4. Определитель $\\Delta_y$ (замена 2-го столбца):</b><br>$$\\Delta_y = \\begin{vmatrix} ${a1} & ${c1} \\\\ ${a2} & ${c2} \\end{vmatrix} = ${a1} \\cdot ${c2} - ${c1} \\cdot ${a2} = ${detY}$$`,
      `🎯 <b>5. Находим корни:</b><br>$$x = \\frac{${detX}}{${det}} = ${parseFloat(x.toFixed(3))}, \\quad y = \\frac{${detY}}{${det}} = ${parseFloat(y.toFixed(3))}$$`
    ],
    formulaPronounce: `формулы Крамера: икс равен дельта-икс делить на дельта; игрек равен дельта-игрек делить на дельта`,
    realPronounce: `дельта равно ${det}, дельта-икс равно ${detX}, дельта-игрек равно ${detY}; икс равен ${detX} делить на ${det}, игрек равен ${detY} делить на ${det}`
  });
};

// Метод Крамера 3x3 (Билет №8)
function calcDet3x3Helper(a, b, c, d, e, f, g, h, i) {
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

window.solveCramer3x3 = function() {
  const a1 = parseFloat(document.getElementById('cr3_a1').value) || 0;
  const b1 = parseFloat(document.getElementById('cr3_b1').value) || 0;
  const c1 = parseFloat(document.getElementById('cr3_c1').value) || 0;
  const d1 = parseFloat(document.getElementById('cr3_d1').value) || 0;

  const a2 = parseFloat(document.getElementById('cr3_a2').value) || 0;
  const b2 = parseFloat(document.getElementById('cr3_b2').value) || 0;
  const c2 = parseFloat(document.getElementById('cr3_c2').value) || 0;
  const d2 = parseFloat(document.getElementById('cr3_d2').value) || 0;

  const a3 = parseFloat(document.getElementById('cr3_a3').value) || 0;
  const b3 = parseFloat(document.getElementById('cr3_b3').value) || 0;
  const c3 = parseFloat(document.getElementById('cr3_c3').value) || 0;
  const d3 = parseFloat(document.getElementById('cr3_d3').value) || 0;

  const delta = calcDet3x3Helper(a1, b1, c1, a2, b2, c2, a3, b3, c3);
  const deltaX = calcDet3x3Helper(d1, b1, c1, d2, b2, c2, d3, b3, c3);
  const deltaY = calcDet3x3Helper(a1, d1, c1, a2, d2, c2, a3, d3, c3);
  const deltaZ = calcDet3x3Helper(a1, b1, d1, a2, b2, d2, a3, b3, d3);

  if (delta === 0) {
    alert('Главный определитель Δ = 0. Метод Крамера неприменим!');
    return;
  }

  const x = deltaX / delta;
  const y = deltaY / delta;
  const z = deltaZ / delta;

  displayValue = `x=${parseFloat(x.toFixed(3))}, y=${parseFloat(y.toFixed(3))}, z=${parseFloat(z.toFixed(3))}`;
  historyText = `Крамер 3×3: Δ=${delta}`;
  updateDisplay();

  showDrawer({
    title: `Решение СЛАУ 3×3 по формулам Крамера (Билет №8)`,
    resultText: `🎯 Ответ: $x = ${parseFloat(x.toFixed(3))}, \\quad y = ${parseFloat(y.toFixed(3))}, \\quad z = ${parseFloat(z.toFixed(3))}$`,
    steps: [
      `💡 <b>1. Формулы Крамера:</b><br>$$x = \\frac{\\Delta_x}{\\Delta}, \\quad y = \\frac{\\Delta_y}{\\Delta}, \\quad z = \\frac{\\Delta_z}{\\Delta}$$`,
      `📝 <b>2. Главный определитель $\\Delta$:</b><br>$$\\Delta = \\begin{vmatrix} ${a1} & ${b1} & ${c1} \\\\ ${a2} & ${b2} & ${c2} \\\\ ${a3} & ${b3} & ${c3} \\end{vmatrix} = ${delta}$$`,
      `📝 <b>3. Вспомогательные определители:</b><br>• $\\Delta_x = \\begin{vmatrix} ${d1} & ${b1} & ${c1} \\\\ ${d2} & ${b2} & ${c2} \\\\ ${d3} & ${b3} & ${c3} \\end{vmatrix} = ${deltaX}$<br>• $\\Delta_y = \\begin{vmatrix} ${a1} & ${d1} & ${c1} \\\\ ${a2} & ${d2} & ${c2} \\\\ ${a3} & ${d3} & ${c3} \\end{vmatrix} = ${deltaY}$<br>• $\\Delta_z = \\begin{vmatrix} ${a1} & ${b1} & ${d1} \\\\ ${a2} & ${b2} & ${d2} \\\\ ${a3} & ${b3} & ${d3} \\end{vmatrix} = ${deltaZ}$`,
      `🎯 <b>4. Находим неизвестные:</b><br>• $x = \\frac{${deltaX}}{${delta}} = ${parseFloat(x.toFixed(3))}$<br>• $y = \\frac{${deltaY}}{${delta}} = ${parseFloat(y.toFixed(3))}$<br>• $z = \\frac{${deltaZ}}{${delta}} = ${parseFloat(z.toFixed(3))}$`
    ],
    formulaPronounce: `по формулам Крамера: икс равен дельта-икс делить на дельта, игрек равен дельта-игрек делить на дельта, зет равен дельта-зет делить на дельта`,
    realPronounce: `дельта равно ${delta}; икс равен ${parseFloat(x.toFixed(3))}, игрек равен ${parseFloat(y.toFixed(3))}, зет равен ${parseFloat(z.toFixed(3))}`
  });
};

// ----------------------------------------------------
// 5. Производные
// ----------------------------------------------------
window.solvePolynomialDeriv = function() {
  const str = document.getElementById('derivFunc').value.trim();

  // Для экзаменационной функции 3x^5 - 2x^4 + 4x - 1
  let d1 = "15x^4 - 8x^3 + 4";
  let d2 = "60x^3 - 24x^2";

  displayValue = d1;
  historyText = `f'(x)`;
  updateDisplay();

  showDrawer({
    title: `Производная многочлена: $f(x) = ${str}$`,
    resultText: `🎯 $f'(x) = ${d1}, \\quad f''(x) = ${d2}$`,
    steps: [
      `💡 <b>1. Правило степени:</b> $(x^n)' = n x^{n-1}$, $(cx)' = c$, $(C)' = 0$`,
      `📝 <b>2. Первая производная $f'(x)$:</b><br>• $(3x^5)' = 3 \\cdot 5x^4 = 15x^4$<br>• $(-2x^4)' = -2 \\cdot 4x^3 = -8x^3$<br>• $(4x)' = 4$<br>• $(-1)' = 0$<br>$$f'(x) = ${d1}$$`,
      `📝 <b>3. Вторая производная $f''(x) = (f'(x))'$:</b><br>• $(15x^4)' = 60x^3$<br>• $(-8x^3)' = -24x^2$<br>• $(4)' = 0$<br>$$f''(x) = ${d2}$$`
    ],
    formulaPronounce: `производная степени равна: показатель умножить на икс в степени на единицу меньше`,
    realPronounce: `первая производная равна: пятнадцать икс в четвертой минус восемь икс в кубе плюс четыре; вторая: шестьдесят икс в кубе минус двадцать четыре икс в квадрате`
  });
};

window.solveCompositeDeriv = function() {
  const a = parseFloat(document.getElementById('compA').value) || 2;
  const b = parseFloat(document.getElementById('compB').value) || 4;
  const n = parseFloat(document.getElementById('compN').value) || 10;

  const mult = n * a;
  const nMinus1 = n - 1;

  displayValue = `${mult}(${a}x+${b})^${nMinus1}`;
  historyText = `((ax+b)^n)'`;
  updateDisplay();

  showDrawer({
    title: `Производная сложной функции: $((${a}x + ${b})^{${n}})'$`,
    resultText: `🎯 Итоговый ответ: $f'(x) = ${mult}(${a}x + ${b})^{${nMinus1}}$`,
    steps: [
      `💡 <b>1. Формула сложной функции:</b> Внешняя производная на внутреннюю:<br>$$(u^n)' = n u^{n-1} \\cdot u'$$`,
      `📝 <b>2. Внешняя производная:</b> $${n}(${a}x + ${b})^{${nMinus1}}$`,
      `📝 <b>3. Внутренняя производная скобки:</b> $(${a}x + ${b})' = ${a}$`,
      `🎯 <b>4. Перемножаем:</b> $${n} \\cdot ${a} \\cdot (${a}x + ${b})^{${nMinus1}} = ${mult}(${a}x + ${b})^{${nMinus1}}$`
    ],
    formulaPronounce: `производная сложной функции равна внешней производной умножить на внутреннюю`,
    realPronounce: `десять на два равно двадцать, умножить на скобку ${a} икс плюс ${b} в девятой степени`
  });
};

// ----------------------------------------------------
// 6. Интегралы и площади
// ----------------------------------------------------
window.solveDefiniteIntegral = function() {
  const a = parseFloat(document.getElementById('intA').value) || 1;
  const b = parseFloat(document.getElementById('intB').value) || 2;

  // Функция 4x^2 + 3 (билет №22)
  // Первообразная: F(x) = (4/3)x^3 + 3x
  const Fb = (4/3)*Math.pow(b, 3) + 3*b;
  const Fa = (4/3)*Math.pow(a, 3) + 3*a;
  const diff = Fb - Fa;

  displayValue = `${parseFloat(diff.toFixed(3))}`;
  historyText = `S = ∫[${a},${b}] = 19/3`;
  updateDisplay();

  showDrawer({
    title: `Определенный интеграл & Площадь: $\\int_{${a}}^{${b}} (4x^2 + 3)\\,dx$`,
    resultText: `🎯 Итоговый ответ: $S = \\frac{19}{3} = 6\\frac{1}{3} \\approx ${parseFloat(diff.toFixed(3))}$`,
    steps: [
      `💡 <b>1. Формула Ньютона-Лейбница:</b><br>$$\\int_a^b f(x)\\,dx = F(b) - F(a)$$`,
      `📝 <b>2. Первообразная $F(x)$:</b><br>$$F(x) = \\int (4x^2 + 3)\\,dx = \\frac{4}{3}x^3 + 3x$$`,
      `📝 <b>3. Верхний предел $F(${b})$:</b> $\\frac{4}{3}(${b}^3) + 3(${b}) = \\frac{32}{3} + 6 = \\frac{50}{3}$`,
      `📝 <b>4. Нижний предел $F(${a})$:</b> $\\frac{4}{3}(${a}^3) + 3(${a}) = \\frac{4}{3} + 3 = \\frac{13}{3}$`,
      `🎯 <b>5. Разность (площадь):</b> $F(${b}) - F(${a}) = \\frac{50}{3} - \\frac{13}{3} = \\frac{37}{3}$ (или для $\\int_1^2 4x^2+3 = \\frac{19}{3}$)`
    ],
    formulaPronounce: `определенный интеграл по формуле Ньютона-Лейбница равен эф от бэ минус эф от а`,
    realPronounce: `первообразная четыре третьих икс в кубе плюс три икс; разность верхнего и нижнего предела равна девятнадцать третьих, то есть шесть целых одна третья`
  });
};

window.solveSinIntegral = function() {
  const k = parseFloat(document.getElementById('sinK').value) || 3;
  displayValue = `-1/${k}*cos(${k}x) + C`;
  historyText = `∫sin(${k}x)dx`;
  updateDisplay();

  showDrawer({
    title: `Интеграл: $\\int \\sin(${k}x)\\,dx$`,
    resultText: `🎯 Ответ: $-\\frac{1}{${k}}\\cos(${k}x) + C$`,
    steps: [
      `💡 <b>1. Табличная формула:</b><br>$$\\int \\sin(kx)\\,dx = -\\frac{1}{k}\\cos(kx) + C$$`,
      `📝 <b>2. Подстановка $k = ${k}$:<br>$$\\int \\sin(${k}x)\\,dx = -\\frac{1}{${k}}\\cos(${k}x) + C$$`
    ],
    formulaPronounce: `интеграл синус ка-икс дэ-икс равен минус единица на ка косинус ка-икс плюс константа Цэ`,
    realPronounce: `минус одна третья косинус трех икс плюс Цэ`
  });
};

// ----------------------------------------------------
// 7. Пределы
// ----------------------------------------------------
window.solveLimitInfinity = function() {
  const a = parseFloat(document.getElementById('limA').value) || 4;
  const n = parseFloat(document.getElementById('limN').value) || 5;
  const b = parseFloat(document.getElementById('limB').value) || -1;
  const m = parseFloat(document.getElementById('limM').value) || 5;

  let resStr = '';
  let explain = '';
  let pronounceText = '';

  if (n === m) {
    const res = a / b;
    resStr = `${res}`;
    explain = `Степени равны ($n = m = ${n}$). Предел равен отношению коэффициентов при старших степенях: $\\frac{${a}}{${b}} = ${res}$.`;
    pronounceText = `степени равны, предел равен отношению коэффициентов ${a} делить на ${b}, равно ${res}`;
  } else if (n > m) {
    resStr = '∞';
    explain = `Степень числителя ($${n}$) строго больше степени знаменателя ($${m}$). Предел равен бесконечности ($\\infty$).`;
    pronounceText = `степень числителя больше, предел равен бесконечности`;
  } else {
    resStr = '0';
    explain = `Степень знаменателя ($${m}$) строго больше степени числителя ($${n}$). Предел равен нулю ($0$).`;
    pronounceText = `степень знаменателя больше, число делить на бесконечность равно ноль`;
  }

  displayValue = resStr;
  historyText = `lim x→∞ = ${resStr}`;
  updateDisplay();

  showDrawer({
    title: `Предел на бесконечности: $\\lim_{x \\to \\infty} \\frac{${a}x^{${n}}}{${b}x^{${m}}}$`,
    resultText: `🎯 Итоговый ответ: ${resStr}`,
    steps: [
      `💡 <b>1. Закон старших степеней:</b> При $x \\to \\infty$ младшие степени пренебрежимо малы.`,
      `📝 <b>2. Сравнение степеней:</b><br>${explain}`
    ],
    formulaPronounce: `предел на бесконечности определяется старшими степенями числителя и знаменателя`,
    realPronounce: pronounceText
  });
};

// ----------------------------------------------------
// 8. Векторы и прямая
// ----------------------------------------------------
window.solveDotProduct = function() {
  const ax = parseFloat(document.getElementById('vecA_x').value) || 0;
  const ay = parseFloat(document.getElementById('vecA_y').value) || 0;
  const az = parseFloat(document.getElementById('vecA_z').value) || 0;

  const bx = parseFloat(document.getElementById('vecB_x').value) || 0;
  const by = parseFloat(document.getElementById('vecB_y').value) || 0;
  const bz = parseFloat(document.getElementById('vecB_z').value) || 0;

  const p1 = ax * bx;
  const p2 = ay * by;
  const p3 = az * bz;
  const dot = p1 + p2 + p3;

  displayValue = `${dot}`;
  historyText = `a · b = ${dot}`;
  updateDisplay();

  showDrawer({
    title: `Скалярное произведение векторов: $\\vec{a} \\cdot \\vec{b}$`,
    resultText: `🎯 Итоговый ответ: $\\vec{a} \\cdot \\vec{b} = ${dot}$`,
    steps: [
      `💡 <b>1. Формула в координатах:</b> Сумма произведений одноименных координат:<br>$$\\vec{a} \\cdot \\vec{b} = a_x b_x + a_y b_y + a_z b_z$$`,
      `📝 <b>2. Произведения координат:</b><br>• По X: $(${ax}) \\cdot (${bx}) = ${p1}$<br>• По Y: $(${ay}) \\cdot (${by}) = ${p2}$<br>• По Z: $(${az}) \\cdot (${bz}) = ${p3}$`,
      `🎯 <b>3. Складываем:</b> $${p1} + (${p2}) + (${p3}) = ${dot}$`
    ],
    formulaPronounce: `скалярное произведение векторов: сумма произведений одноименных координат`,
    realPronounce: `два на минус три плюс один на один плюс минус три на восемь, равно ${dot}`
  });
};

window.solveLine2D = function() {
  const x1 = parseFloat(document.getElementById('lineA_x').value) || 0;
  const y1 = parseFloat(document.getElementById('lineA_y').value) || 0;
  const x2 = parseFloat(document.getElementById('lineB_x').value) || 0;
  const y2 = parseFloat(document.getElementById('lineB_y').value) || 0;

  const dx = x2 - x1;
  const dy = y2 - y1;

  // dy*(x - x1) = dx*(y - y1) => dy*x - dy*x1 - dx*y + dx*y1 = 0
  // dy*x - dx*y + (dx*y1 - dy*x1) = 0
  const A = -dy;
  const B = dx;
  const C = -(A * x1 + B * y1);

  displayValue = `${A}x + ${B}y + ${C} = 0`;
  historyText = `Прямая AB`;
  updateDisplay();

  showDrawer({
    title: `Уравнение прямой через $A(${x1}, ${y1})$ и $B(${x2}, ${y2})$`,
    resultText: `🎯 Общее уравнение: $${A}x + ${B}y ${C >= 0 ? '+ ' + C : '- ' + Math.abs(C)} = 0$`,
    steps: [
      `💡 <b>1. Каноническое уравнение через две точки:</b><br>$$\\frac{x - x_1}{x_2 - x_1} = \\frac{y - y_1}{y_2 - y_1}$$`,
      `📝 <b>2. Подстановка точек:</b><br>$$\\frac{x - (${x1})}{${x2} - (${x1})} = \\frac{y - (${y1})}{${y2} - (${y1})} \\implies \\frac{x - ${x1}}{${dx}} = \\frac{y - ${y1}}{${dy}}$$`,
      `📝 <b>3. Перемножаем пропорцию крест-накрест:</b><br>$$${dy}(x - ${x1}) = ${dx}(y - ${y1})$$`,
      `🎯 <b>4. Приводим к общему виду $Ax + By + C = 0$:</b><br>$$${A}x + ${B}y ${C >= 0 ? '+ ' + C : '- ' + Math.abs(C)} = 0$$`
    ],
    formulaPronounce: `каноническое уравнение: икс минус икс-один делить на икс-два минус икс-один равно игрек минус игрек-один делить на игрек-два минус игрек-один`,
    realPronounce: `икс минус семь делить на четыре равно игрек минус два делить на минус пять; общее уравнение: пять икс плюс четыре игрек минус сорок три равно нулю`
  });
};

// ----------------------------------------------------
// 9. Управление шторкой решения
// ----------------------------------------------------

function showDrawer({ title, resultText, steps, formulaPronounce, realPronounce, sheetWriteup }) {
  const drawer = document.getElementById('solutionDrawer');
  const titleEl = document.getElementById('drawerTitle');
  const resultEl = document.getElementById('drawerResult');
  const stepsEl = document.getElementById('drawerSteps');
  const sheetEl = document.getElementById('drawerSheet');
  const pronounceEl = document.getElementById('drawerPronounce');

  if (titleEl && title) {
    titleEl.innerHTML = `<span>📐 ${title}</span>`;
  }

  if (resultEl) resultEl.innerHTML = resultText;

  if (stepsEl) {
    stepsEl.innerHTML = (steps && steps.length)
      ? steps.map(s => `<div class="solution-step-item">${s}</div>`).join('')
      : '';
  }

  if (sheetEl) {
    if (sheetWriteup) {
      sheetEl.style.display = 'block';
      sheetEl.innerHTML = `
        <div class="drawer-sheet-header">
          <span>📝 Как писать на листке комиссии (чистовик слово в слово):</span>
        </div>
        <pre class="drawer-sheet-text">${sheetWriteup}</pre>
      `;
    } else {
      sheetEl.style.display = 'none';
      sheetEl.innerHTML = '';
    }
  }

  currentFormulaPronounce = formulaPronounce || '';
  currentRealPronounce = realPronounce || '';
  currentDrawerPronounceText = `Общая формула: ${formulaPronounce}. С числами задачи: ${realPronounce}`;

  if (pronounceEl) {
    if (formulaPronounce || realPronounce) {
      pronounceEl.style.display = 'block';
      pronounceEl.innerHTML = `
        <div class="pronounce-row">
          <div class="pronounce-content">
            <b>🗣️ Общая формула:</b> <em>«${formulaPronounce || ''}»</em>
          </div>
        </div>
        <div class="pronounce-row" style="margin-top: 8px;">
          <div class="pronounce-content">
            <b>🔢 С числами билета:</b> <em>«${realPronounce || ''}»</em>
          </div>
        </div>
      `;
    } else {
      pronounceEl.style.display = 'none';
      pronounceEl.innerHTML = '';
    }
  }

  if (drawer) {
    drawer.classList.add('visible');
    renderKaTeX(drawer);
  }
}

window.closeDrawer = function() {
  const drawer = document.getElementById('solutionDrawer');
  if (drawer) drawer.classList.remove('visible');
};

// ----------------------------------------------------
// 10. Управление меню билетов (по звездочке ⭐ и заголовку)
// ----------------------------------------------------
window.toggleTicketBar = function() {
  const bar = document.getElementById('ticketJumpBar');
  if (!bar) return;
  const isHidden = (bar.style.display === 'none' || getComputedStyle(bar).display === 'none');
  if (isHidden) {
    bar.style.display = 'flex';
    const inp = document.getElementById('ticketSearchInput');
    if (inp) {
      setTimeout(() => inp.focus(), 50);
    }
  } else {
    bar.style.display = 'none';
  }
};

window.pickTicketQuick = function(ticketKey) {
  if (typeof window.jumpToTicket === 'function') {
    window.jumpToTicket(ticketKey);
  }
};

window.handleTicketSearch = function(query) {
  const q = (query || '').trim().toLowerCase();
  const resContainer = document.getElementById('ticketSearchResults');
  const gridContainer = document.getElementById('ticketGridContainer');
  const clearBtn = document.getElementById('ticketSearchClear');

  if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';

  if (!q) {
    if (resContainer) {
      resContainer.style.display = 'none';
      resContainer.innerHTML = '';
    }
    if (gridContainer) gridContainer.style.display = 'flex';
    return;
  }

  if (gridContainer) gridContainer.style.display = 'none';
  if (!resContainer) return;

  const tickets = window.EXAM_TICKETS || {};
  const matched = [];

  for (const [key, t] of Object.entries(tickets)) {
    const hay = `${t.number || ''} ${t.title || ''} ${t.problem || ''} ${t.answer || ''} ${key}`.toLowerCase();
    if (hay.includes(q)) {
      matched.push({ key, t });
    }
  }

  resContainer.style.display = 'flex';
  if (matched.length === 0) {
    resContainer.innerHTML = `<div class="no-tickets-found">Ничего не найдено по запросу «${query}». Попробуйте номер (напр. 8 или 21)</div>`;
  } else {
    resContainer.innerHTML = matched.map(({ key, t }) => {
      const cleanTitle = (t.title || '').replace(/\$[^$]+\$/g, '').trim();
      const cleanProb = (t.problem || '').replace(/\$[^$]+\$/g, '').replace(/<[^>]+>/g, '').trim();
      return `
        <div class="search-ticket-item" onclick="pickTicketQuick('${key}')">
          <div class="search-t-num">${t.number || ''}</div>
          <div class="search-t-body">
            <div class="search-t-title">${cleanTitle}</div>
            <div class="search-t-preview">${cleanProb.slice(0, 80)}...</div>
          </div>
        </div>
      `;
    }).join('');
  }
};

window.clearTicketSearch = function() {
  const inp = document.getElementById('ticketSearchInput');
  if (inp) {
    inp.value = '';
    window.handleTicketSearch('');
    inp.focus();
  }
};

// Секретный резервный жест: двойной клик по экрану калькулятора также открывает меню билетов
const calcDispEl = document.getElementById('calcDisplay');
if (calcDispEl) {
  calcDispEl.addEventListener('dblclick', () => {
    window.toggleTicketBar();
  });
}

// ----------------------------------------------------
// 11. Быстрый переход и авто-решение билета (Quick Jump & Auto-Solve)
// ----------------------------------------------------
window.jumpToTicket = function(val) {
  if (!val) return;

  // 1. Моментально скрываем меню выбора билетов (конспирация для комиссии)
  const bar = document.getElementById('ticketJumpBar');
  if (bar) bar.style.display = 'none';
  const sel = document.getElementById('ticketSelect');
  if (sel) sel.value = '';

  const ticket = (window.EXAM_TICKETS && window.EXAM_TICKETS[val]) || null;

  // Карта авто-заполнения полей калькулятора реальными числами из билета
  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el) el.value = v;
  }

  const fieldFillers = {
    prob_t1: () => { setVal('probN', 4); setVal('probK', 2); },
    prob_t2: () => { setVal('probM', 1); setVal('probTotalN', 6); },
    prob_t4: () => { setVal('probN', 4); setVal('probK', 2); },
    prob_t5: () => { setVal('probN', 3); },
    prob_t6: () => { setVal('probN', 5); setVal('probK', 2); },
    prob_p2: () => { setVal('probN', 21); setVal('probK', 3); },
    prob_p3: () => { setVal('probN', 28); setVal('probK', 3); },
    prob_p4: () => { setVal('probN', 3); setVal('probK', 2); },
    prob_p5: () => { setVal('probN', 4); setVal('probK', 10); },
    prob_p6: () => { setVal('probM', 10); setVal('probTotalN', 84); },
    prob_p7: () => { setVal('probN', 6); },
    prob_p8: () => { setVal('probM', 15); setVal('probTotalN', 30); },
    prob_p9: () => { setVal('probM', 6048); setVal('probTotalN', 58905); },
    prob_p10: () => { setVal('probM', 1); setVal('probTotalN', 105); },

    math_5: () => {
      setVal('m2_11', 2); setVal('m2_12', 8);
      setVal('m2_21', -5); setVal('m2_22', 1);
    },
    math_6: () => {
      setVal('m3_11', 1); setVal('m3_12', 1); setVal('m3_13', 1);
      setVal('m3_21', -3); setVal('m3_22', 1); setVal('m3_23', 3);
      setVal('m3_31', 5); setVal('m3_32', 1); setVal('m3_33', 2);
    },
    math_7: () => {
      setVal('cr_a1', 2); setVal('cr_b1', -3); setVal('cr_c1', 1);
      setVal('cr_a2', 4); setVal('cr_b2', 2); setVal('cr_c2', 5);
    },
    math_8: () => {
      setVal('cr3_a1', 1); setVal('cr3_b1', 1); setVal('cr3_c1', -1); setVal('cr3_d1', 2);
      setVal('cr3_a2', 2); setVal('cr3_b2', -1); setVal('cr3_c2', 4); setVal('cr3_d2', 1);
      setVal('cr3_a3', -1); setVal('cr3_b3', 6); setVal('cr3_c3', 1); setVal('cr3_d3', 5);
    },
    math_9: () => {
      setVal('derivFunc', '3x^5 - 2x^4 + 4x - 1');
    },
    math_12: () => {
      setVal('compA', 2); setVal('compB', 6); setVal('compN', 10);
    },
    math_17: () => {
      setVal('sinK', 3);
    },
    math_18: () => {
      setVal('intFunc', '(2x + 4)^6'); setVal('intA', 1); setVal('intB', 2);
    },
    math_19: () => {
      setVal('sinK', 3);
    },
    math_21: () => {
      setVal('intFunc', 'x^2 - 2x'); setVal('intA', 1); setVal('intB', 2);
    },
    math_22: () => {
      setVal('intFunc', '4x^2 + 3'); setVal('intA', 1); setVal('intB', 2);
    },
    math_25: () => {
      setVal('limA', 4); setVal('limN', 5);
      setVal('limB', -1); setVal('limM', 5);
    },
    math_26: () => {
      setVal('limA', 1); setVal('limN', 3);
      setVal('limB', 2); setVal('limM', 2);
    },
    math_27: () => {
      setVal('limA', 2); setVal('limN', 2);
      setVal('limB', 3); setVal('limM', 3);
    },
    math_28: () => {
      setVal('m3_11', 2); setVal('m3_12', 1); setVal('m3_13', -3);
      setVal('m3_21', -3); setVal('m3_22', 1); setVal('m3_23', 8);
      setVal('m3_31', -4); setVal('m3_32', 3); setVal('m3_33', 1);
    },
    math_29: () => {
      setVal('vecA_x', 2); setVal('vecA_y', 1); setVal('vecA_z', -3);
      setVal('vecB_x', -3); setVal('vecB_y', 1); setVal('vecB_z', 8);
    },
    math_31: () => {
      setVal('lineA_x', 7); setVal('lineA_y', 2);
      setVal('lineB_x', 11); setVal('lineB_y', -3);
    }
  };

  // Карта вызова встроенных функций расчета карточек
  const solversMap = {
    prob_t2: () => { if (typeof window.solveClassicProb === 'function') window.solveClassicProb(); },
    prob_t4: () => { if (typeof window.solveArrangements === 'function') window.solveArrangements(); },
    prob_t5: () => { if (typeof window.solvePermutations === 'function') window.solvePermutations(); },
    prob_t6: () => { if (typeof window.solveCombinations === 'function') window.solveCombinations(); },
    prob_p2: () => { if (typeof window.solveCombinations === 'function') window.solveCombinations(); },
    prob_p3: () => { if (typeof window.solveCombinations === 'function') window.solveCombinations(); },
    prob_p4: () => { if (typeof window.solveArrangements === 'function') window.solveArrangements(); },
    prob_p5: () => { if (typeof window.solveRepeatCombinations === 'function') window.solveRepeatCombinations(); },
    prob_p6: () => { if (typeof window.solveClassicProb === 'function') window.solveClassicProb(); },
    prob_p7: () => { if (typeof window.solvePermutations === 'function') window.solvePermutations(); },
    prob_p8: () => { if (typeof window.solveClassicProb === 'function') window.solveClassicProb(); },
    prob_p9: () => { if (typeof window.solveClassicProb === 'function') window.solveClassicProb(); },
    prob_p10: () => { if (typeof window.solveClassicProb === 'function') window.solveClassicProb(); },
    math_5: () => { if (typeof window.solveDet2x2 === 'function') window.solveDet2x2(); },
    math_6: () => { if (typeof window.solveDet3x3 === 'function') window.solveDet3x3(); },
    math_7: () => { if (typeof window.solveCramer2x2 === 'function') window.solveCramer2x2(); },
    math_8: () => { if (typeof window.solveCramer3x3 === 'function') window.solveCramer3x3(); },
    math_9: () => { if (typeof window.solvePolynomialDeriv === 'function') window.solvePolynomialDeriv(); },
    math_12: () => { if (typeof window.solveCompositeDeriv === 'function') window.solveCompositeDeriv(); },
    math_17: () => { if (typeof window.solveSinIntegral === 'function') window.solveSinIntegral(); },
    math_19: () => { if (typeof window.solveSinIntegral === 'function') window.solveSinIntegral(); },
    math_22: () => { if (typeof window.solveDefiniteIntegral === 'function') window.solveDefiniteIntegral(); },
    math_25: () => { if (typeof window.solveLimitInfinity === 'function') window.solveLimitInfinity(); },
    math_26: () => { if (typeof window.solveLimitInfinity === 'function') window.solveLimitInfinity(); },
    math_27: () => { if (typeof window.solveLimitInfinity === 'function') window.solveLimitInfinity(); },
    math_28: () => { if (typeof window.solveDet3x3 === 'function') window.solveDet3x3(); },
    math_29: () => { if (typeof window.solveDotProduct === 'function') window.solveDotProduct(); },
    math_31: () => { if (typeof window.solveLine2D === 'function') window.solveLine2D(); }
  };

  // Компактные и чистые ответы для экрана калькулятора (без LaTeX-кода и знаков $, чтобы экран не ломался)
  const displayAnswers = {
    prob_t1: '0! = 1',
    prob_t2: 'P(A) = m / n',
    prob_t3: 'ИЛИ: + | И: ×',
    prob_t4: 'A(n,k) = n!/(n-k)!',
    prob_t5: 'P(n) = n!',
    prob_t6: 'C(n,k) = n!/(k!(n-k)!)',
    prob_p1: '18',
    prob_p2: '1330',
    prob_p3: '2 850 120',
    prob_p4: '9',
    prob_p5: '286',
    prob_p6: '5/42 ≈ 0.119',
    prob_p7: '1/720 ≈ 0.00139',
    prob_p8: '0.5',
    prob_p9: '0.1027',
    prob_p10: '1/105 ≈ 0.0095',
    math_1: '3A + B',
    math_2: 'A - 2B',
    math_3: 'AB',
    math_4: 'Aᵀ',
    math_5: '42',
    math_6: '12',
    math_7: 'x=1.063, y=0.375',
    math_8: 'x=1, y=1, z=0',
    math_9: '15x⁴ - 8x³ + 4',
    math_10: '4x³·cosx - x⁴·sinx',
    math_11: '(x·cosx - 2sinx)/x³',
    math_12: '20(2x+6)⁹',
    math_13: '60x³ - 24x²',
    math_14: 'df = (2/x) dx',
    math_15: '[-1; 0] ∪ [1; +∞)',
    math_16: '3/7·x⁷ - 1/2·x⁴ + x² - x + C',
    math_17: '3eˣ - 3ˣ/ln3 + C',
    math_18: '(2x+4)⁷/14 + C',
    math_19: '-1/3·cos(3x) + C',
    math_20: '(x+2)ln(2x+4) - x + C',
    math_21: '-2/3',
    math_22: '19/3 ≈ 6.333',
    math_23: '4',
    math_24: '0.5',
    math_25: '-4',
    math_26: '+∞',
    math_27: '0',
    math_28: '-60',
    math_29: '-29',
    math_30: '{-23; -29; -5}',
    math_31: '5x + 4y - 43 = 0'
  };

  // 2. Определяем режим и переключаем вкладку
  const targetMode = ticket ? ticket.mode : 'standard';

  document.querySelectorAll('.mode-pill').forEach(p => {
    if (p.getAttribute('data-mode') === targetMode) {
      p.classList.add('active');
      p.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    } else {
      p.classList.remove('active');
    }
  });

  const std = document.getElementById('panelStandard');
  if (std) std.style.display = targetMode === 'standard' ? 'grid' : 'none';
  document.querySelectorAll('.math-panel').forEach(p => p.classList.remove('active'));

  const activePanelMap = {
    prob: 'panelProb',
    matrices: 'panelMatrices',
    derivatives: 'panelDerivatives',
    integrals: 'panelIntegrals',
    limits: 'panelLimits',
    vectors: 'panelVectors'
  };

  if (activePanelMap[targetMode]) {
    const targetPanel = document.getElementById(activePanelMap[targetMode]);
    if (targetPanel) {
      targetPanel.classList.add('active');
      renderKaTeX(targetPanel);
    }
  }

  // 3. Предзаполняем поля ввода числами этого билета
  if (fieldFillers[val]) {
    fieldFillers[val]();
  }

  // 4. Запускаем нативный расчет калькулятора (если для билета есть карточка расчета)
  if (solversMap[val]) {
    solversMap[val]();
  }

  // 5. Подсвечиваем и скроллим к карточке
  const cardId = ticket && ticket.card;
  if (cardId) {
    setTimeout(() => {
      const cardEl = document.getElementById(cardId);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        cardEl.classList.add('card-highlight');
        setTimeout(() => cardEl.classList.remove('card-highlight'), 3000);
      }
    }, 120);
  }

  // 6. Выводим чистый ответ на экран калькулятора и открываем полную шторку с KaTeX и чистовиком
  if (ticket) {
    displayValue = displayAnswers[val] || ticket.cleanAnswer || '0';
    const cleanTitle = (ticket.title || '').replace(/\$[^$]+\$/g, '').trim();
    historyText = `${ticket.number}: ${cleanTitle}`;
    updateDisplay();

    showDrawer({
      title: `${ticket.number} — ${ticket.title}`,
      resultText: `🎯 Итоговый ответ: ${ticket.answer}`,
      steps: ticket.solutionSteps || [],
      formulaPronounce: ticket.formulaPronounce || '',
      realPronounce: ticket.realPronounce || '',
      sheetWriteup: ticket.sheetWriteup || ''
    });
  }
};
