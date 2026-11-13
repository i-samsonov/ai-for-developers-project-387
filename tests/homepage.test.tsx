import { renderToStaticMarkup } from 'react-dom/server'
import { expect, test } from 'vitest'
import App from '../src/App'

test('главная показывает предложение записи и рабочие ссылки на разделы', () => {
  const html = renderToStaticMarkup(<App />)
  expect(html).toContain('Быстрая запись на звонок')
  expect(html).toContain('Что доступно прямо сейчас')
  expect(html).toContain('href="#/booking"')
  expect(html).toContain('href="#/upcoming"')
  expect(html).not.toContain('Выберите тип встречи')
})
