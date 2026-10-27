/**
 * Чиста логіка руху в застосунку (DESIGN.md, розділ 11), окремо від компонентів, щоб перевірити тестами без DOM.
 */

/**
 * Куди стає підсвітка меню. `clicked` — пункт, на який щойно натиснули, і адреса (шлях + параметри), з якої
 * натиснули. Поки адреса та сама, перехід ще йде — підсвітка вже на натиснутому. Будь-яка інша адреса означає, що
 * перехід завершився або його перебив інший (зміна року на /balances, «Назад»), — тоді підсвітка за шляхом.
 */
export function highlightTarget(clicked: { href: string; from: string } | null, location: string, pathname: string): string {
  return clicked && clicked.from === location ? clicked.href : pathname;
}

/**
 * Кадр числа, що «докручується»: частка `t` від 0 до 1 з ease-out, до `decimals` знаків. toFixed(-0.001) дає "-0.00",
 * тож нуль — без знака. Останній кадр (`t` = 1) — саме `target`.
 */
export function countUpText(target: number, t: number, decimals: number): string {
  const text = (target * (1 - (1 - Math.min(1, Math.max(0, t))) ** 3)).toFixed(decimals);
  return Number(text) === 0 ? (0).toFixed(decimals) : text;
}
