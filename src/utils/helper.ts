import chalk from 'chalk'

export function welcome(site: string) {
  const str = `
================ ${chalk.yellowBright(site)} ================`
  console.log(str)
}

/* 打印横线 */
export function printSeparator(num: number, char = '-') {
  console.log(chalk.gray(char.repeat(num)))
}

/* 首字母大写 */
export function capitalizeFirstLetter(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1)
}
