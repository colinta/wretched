import {unicode} from '../sys'

import type {Viewport} from '../Viewport'
import type {Props as ViewProps} from '../View'
import {View} from '../View'
import {Style} from '../Style'
import {Point, Size} from '../geometry'
import {Alignment, FontFamily} from './types'
import {FONTS} from './fonts'
import {define} from '../util'

interface TextProps {
  text?: string
  lines?: undefined
}

interface LinesProps {
  text?: undefined
  lines: string[]
}

interface StyleProps {
  style?: Style
  alignment: Alignment
  wrap: boolean
  font?: FontFamily
}

type Props = Partial<StyleProps> & (TextProps | LinesProps) & ViewProps

const DEFAULTS = {
  alignment: 'left',
  wrap: false,
  font: 'default',
} as const

export class Text extends View {
  #style: StyleProps['style']
  #text: string = ''
  #lines: [string, number][] = []
  #alignment: StyleProps['alignment'] = DEFAULTS.alignment
  #wrap: StyleProps['wrap'] = DEFAULTS.wrap
  #font: FontFamily = DEFAULTS.font

  constructor(props: Props = {}) {
    super(props)

    this.#update(props)

    define(this, 'text', {enumerable: true})
    define(this, 'font', {enumerable: true})
  }

  get text() {
    return this.#text
  }
  set text(value: string) {
    if (this.#text === value) {
      return
    }

    this.#updateLines(value, value.split('\n'), this.#font)
  }

  get font() {
    return this.#font
  }
  set font(value: FontFamily) {
    if (this.#font === value) {
      return
    }

    this.#updateLines(this.#text, undefined, value)
  }

  get style() {
    return this.#style
  }

  set style(value: Style | undefined) {
    if (this.#style === value) {
      return
    }

    this.#style = value
    this.invalidateRender()
  }

  update(props: Props) {
    this.#update(props)
    super.update(props)
  }

  #update({text, lines, style, alignment, wrap, font}: Props) {
    this.#style = style
    this.#alignment = alignment ?? DEFAULTS.alignment
    this.#wrap = wrap ?? DEFAULTS.wrap
    this.#updateLines(text, lines, font)
  }

  #updateLines(
    text: string | undefined,
    lines: string[] | undefined,
    font: FontFamily | undefined,
  ) {
    this.#font = font ?? DEFAULTS.font
    const fontMap = font && FONTS[font]

    if (text !== undefined) {
      this.#text = text
      lines = text === '' ? [] : text.split('\n')
    } else if (lines !== undefined) {
      this.#text = lines.join('\n')
    } else {
      this.#text = ''
      lines = []
    }

    this.#lines = lines.map(line => {
      if (fontMap) {
        line = [...line].map(c => fontMap.get(c) ?? c).join('')
      }

      return [line, unicode.lineWidth(line)]
    })

    this.invalidateSize()
  }

  naturalSize(available: Size): Size {
    return this.#lines.reduce((size, [, width]) => {
      if (this.#wrap) {
        const lineHeight = 1 + ~~(width / available.width)
        size.width = available.width
        size.height += lineHeight
        return size
      }

      size.width = Math.max(size.width, width)
      size.height += 1
      return size
    }, Size.zero.mutableCopy())
  }

  render(viewport: Viewport) {
    if (viewport.isEmpty) {
      return
    }

    const lines: [string, number][] = this.#lines
    const style: Style = this.theme.text().merge(this.#style)

    viewport.usingPen(style, pen => {
      const point = new Point(0, 0).mutableCopy()
      for (const [line, width] of lines) {
        if (!line.length) {
          point.y += 1
          continue
        }

        let didWrap = false
        const offsetX =
          this.#alignment === 'left'
            ? 0
            : this.#alignment === 'center'
              ? ~~((viewport.contentSize.width - width) / 2)
              : viewport.contentSize.width - width
        point.x = offsetX
        for (const char of unicode.printableChars(line)) {
          const width = unicode.charWidth(char)
          if (width === 0) {
            // track the current style regardless of wether we are printing
            pen.replacePen(Style.fromSGR(char))
            continue
          }

          if (this.#wrap && point.x >= viewport.contentSize.width) {
            didWrap = true
            point.x = 0
            point.y += 1
          }

          if (didWrap && char.match(/\s/)) {
            continue
          }
          didWrap = false

          if (
            point.x >= viewport.visibleRect.minX() &&
            point.x + width - 1 < viewport.visibleRect.maxX()
          ) {
            viewport.write(char, point)
          }

          point.x += width
          // do not early exit when point.x >= maxX. 'line' may contain ANSI codes that
          // need to be picked up by replacePen.
        }

        point.y += 1
      }
    })
  }
}
