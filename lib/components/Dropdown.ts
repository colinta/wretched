import {unicode} from '../sys'

import type {Viewport} from '../Viewport'
import {type Props as ViewProps, View} from '../View'
import {Container} from '../Container'
import {Point, Size, Rect} from '../geometry'
import {
  type BorderChars as BoxBorderChars,
  Box,
  Button,
  Flex,
  Flow,
  ScrollableList,
  Separator,
  Text,
  Checkbox,
} from '../components'
import {
  type MouseEvent,
  isMouseEnter,
  isMouseExit,
  isMouseClicked,
} from '../events'

interface BorderChars {
  control: BoxBorderChars
  hover: BoxBorderChars
  above: BoxBorderChars
  below: BoxBorderChars
}

interface SharedProps<T> extends ViewProps {
  choices: Choices<T>
}

interface StyleProps {
  title?: string
}

type SelectMultipleFn<T> = (value: T[]) => void
type SelectOneFn<T> = (value: T) => void

interface SelectMultiple<T> {
  selected: readonly T[]
  onSelect: SelectMultipleFn<T>
}

interface SelectOne<T> {
  selected?: T
  onSelect: SelectOneFn<T>
}

type Props<T, M extends boolean | undefined> = SharedProps<T> &
  StyleProps & {multiple?: M} & (M extends true
    ? SelectMultiple<T>
    : SelectOne<T>)
type Choices<T> = [string, T][]

export class Dropdown<T, M extends boolean> extends View {
  dropdownSelector: DropdownSelector<T>
  #title?: string[]
  #isHover = false
  #showModal = false
  readonly #multiple: boolean
  #onSelectCallback: SelectMultipleFn<T> | SelectOneFn<T>

  constructor({
    title,
    choices,
    selected,
    multiple,
    onSelect,
    ...viewProps
  }: Props<T, M>) {
    super(viewProps)

    this.#multiple = multiple ?? false
    this.#onSelectCallback = onSelect
    const selectedRows = dropdownSelectedRows(selected, choices, this.#multiple)
    this.dropdownSelector = new DropdownSelector({
      theme: this.theme,
      multiple: this.#multiple,
      choices,
      selected: selectedRows,
      onSelect: () => this.#onSelect(),
    })
    this.#title = title ? title.split('\n') : undefined
  }

  get choices() {
    return this.dropdownSelector.choices
  }
  set choices(choices: SharedProps<T>['choices']) {
    this.dropdownSelector.choices = choices
  }

  #titleLines() {
    if (
      this.#title !== undefined &&
      this.dropdownSelector.selectedValues.length === 0
    ) {
      return this.#title
    }

    return this.dropdownSelector.selectedText ?? ['<select>']
  }

  dismissModal() {
    this.#showModal = false
  }

  get selected(): M extends true ? () => T[] : T | undefined {
    if (this.#multiple) {
      return this.dropdownSelector.selectedValues as any
    } else {
      return this.dropdownSelector.selectedValue as any
    }
  }

  set selected(selected: M extends true ? T[] : T | undefined) {
    this.dropdownSelector.selectedRows = dropdownSelectedRows<T>(
      selected,
      this.dropdownSelector.choices,
      this.#multiple,
    )
  }

  #onSelect() {
    if (this.#multiple) {
      ;(this.#onSelectCallback as any)(this.dropdownSelector.selectedValues)
    } else {
      this.dismissModal()
      const value = this.dropdownSelector.selectedValue
      if (value !== undefined) {
        ;(this.#onSelectCallback as any)(value)
      }
    }

    this.invalidateSize()
  }

  naturalSize(): Size {
    const size = new Size(unicode.stringSize(this.#titleLines()))
    return size.grow(5, 0)
  }

  receiveMouse(event: MouseEvent) {
    if (isMouseEnter(event)) {
      this.#isHover = true
    } else if (isMouseExit(event)) {
      this.#isHover = false
    }

    if (isMouseClicked(event)) {
      this.#showModal = true
    }
  }

  render(viewport: Viewport) {
    if (this.#showModal) {
      viewport.requestModal(this.dropdownSelector, () => {
        this.#showModal = false
      })
    }

    viewport.registerMouse(['mouse.move', 'mouse.button.left'])
    const lines = this.#titleLines()
    const textStyle = this.theme.ui({
      isHover: this.#isHover && !this.#showModal,
    })

    viewport.paint(textStyle)

    const pt = new Point(0, 0).mutableCopy()
    for (; pt.y < viewport.contentSize.height; pt.y++) {
      if (pt.y < lines.length) {
        viewport.write(lines[pt.y], pt.offset(1, 0), textStyle)
      }

      viewport.write(
        `▏  `,
        pt.offset(viewport.contentSize.width - 3, 0),
        textStyle,
      )
    }

    viewport.write(
      this.#showModal ? '◇' : this.#isHover ? '▼' : '▽',
      new Point(
        viewport.contentSize.width - 2,
        viewport.contentSize.height / 2,
      ),
      textStyle,
    )
  }
}

interface SelectorProps<T> extends SharedProps<T> {
  onSelect(): void
  selected: number[]
  multiple: boolean
}

class DropdownSelector<T> extends Container {
  #choices: [string[], T][]
  #selected: Set<number>
  #multiple: boolean
  #onSelect: () => void
  #scrollView: ScrollableList<T>
  #box = new Box({maxHeight: 24, border: BORDERS.below})
  #checkbox: Checkbox

  constructor({
    choices,
    selected,
    multiple,
    onSelect,
    ...viewProps
  }: SelectorProps<T>) {
    super({...viewProps})

    this.#choices = choices.map(([text, value]) => [text.split('\n'), value])
    this.#selected = new Set(selected)
    this.#multiple = multiple
    this.#onSelect = onSelect
    this.#checkbox = new Checkbox({
      text: 'Select all',
      isChecked: false,
      onCheck: value => {
        if (value) {
          this.#selected = new Set(Array(this.#choices.length).keys())
        } else {
          this.#selected = new Set()
        }
        onSelect()
        this.#scrollView.invalidateAllRows('view')
      },
    })
    this.#scrollView = new ScrollableList({
      items: this.#choices.map(([, choice]) => choice),
      cellForItem: (choice, row) => this.cellForItem(choice, row),
    })
    const content = new Flow({direction: 'topToBottom', children: []})

    if (multiple) {
      content.add(this.#checkbox)
    }
    content.add(this.#scrollView)
    this.#box.add(content)
    this.add(this.#box)

    this.#checkbox.isChecked = this.#isAllSelected()
  }

  #isAllSelected() {
    return this.#selected.size === this.#choices.length
  }

  get selectedRows() {
    return [...this.#selected]
  }

  set selectedRows(rows: number[]) {
    new Set([...this.#selected, ...rows]).forEach(selected => {
      const item = this.#choices[selected][1]
      this.#scrollView.invalidateItem(item, 'view')
    })

    this.#selected = new Set(rows)
  }

  get selectedText() {
    if (this.#selected.size === 0) {
      return undefined
    }

    if (this.#selected.size > 1) {
      const rows = [...this.#selected]
      rows.sort()
      return [rows.map(index => this.#choices[index][0].join(' ')).join(', ')]
    }

    const [row] = [...this.#selected]
    return this.#choices[row][0]
  }

  get selectedValue() {
    if (this.#selected.size === 0) {
      return undefined
    }
    const [row] = [...this.#selected]
    return this.#choices[row][1]
  }

  get selectedValues() {
    return [...this.#selected].map(index => this.#choices[index][1])
  }

  get choices() {
    return this.#choices.map(([lines, choice]) => [lines.join('\n'), choice])
  }

  set choices(choices: SharedProps<T>['choices']) {
    const selected = [...this.#selected].map(index => this.#choices[index][1])
    this.#choices = choices.map(([text, choice]) => [text.split('\n'), choice])
    this.#selected = new Set(
      selected.flatMap(item => {
        const index = choices.findIndex(([_, choice]) => choice === item)
        if (index === -1) {
          return []
        }
        return [index]
      }),
    )
    this.#scrollView.updateItems(choices.map(([, choice]) => choice))
  }

  cellForItem(choice: T, row: number) {
    const button = this.#cellButton(choice, row)

    return new Flex({
      direction: 'leftToRight',
      children: [
        ['flex1', button],
        new Separator({direction: 'vertical', border: 'single'}),
      ],
    })
  }

  #cellButton(choice: T, row: number) {
    const lines: string[] = this.#choices[row][0]
    const isSelected = [...this.#selected].some(index => index === row)

    return new Button({
      theme: isSelected ? 'selected' : undefined,
      border: 'none',
      content: new Text({
        width: 'fill',
        lines: lines.map((line, index) => {
          return dropdownPrefix(this.#multiple, index, isSelected) + line
        }),
      }),
      onClick: () => {
        this.#selected.forEach(selected => {
          const item = this.#choices[selected][1]
          this.#scrollView.invalidateItem(item, 'view')
        })

        this.#scrollView.invalidateItem(choice, 'view')

        if (this.#multiple) {
          if (this.#selected.has(row)) {
            this.#selected.delete(row)
          } else {
            this.#selected.add(row)
          }
        } else {
          this.#selected = new Set([row])
        }

        this.#checkbox.isChecked = this.#isAllSelected()

        this.#onSelect()
      },
    })
  }

  render(viewport: Viewport) {
    const naturalSize = this.naturalSize(viewport.contentSize).max(
      viewport.contentSize,
    )
    const fitsBelow =
      viewport.parentRect.maxY() + naturalSize.height <
      viewport.contentSize.height
    const fitsAbove = naturalSize.height <= viewport.parentRect.minY()

    // 1. doesn't fit above or below, pick the side that has more room
    // 2. prefer below
    // 3. otherwise above
    let placement: 'above' | 'below'
    let height = naturalSize.height
    if (!fitsBelow && !fitsAbove) {
      const spaceBelow =
        viewport.contentSize.height - viewport.parentRect.maxY() + 1
      const spaceAbove = viewport.parentRect.minY() + 1
      if (spaceAbove > spaceBelow) {
        placement = 'above'
        height = spaceAbove
      } else {
        placement = 'below'
        height = spaceBelow
      }
    } else if (fitsBelow) {
      placement = 'below'
    } else {
      placement = 'above'
    }

    const width = viewport.parentRect.size.width
    const x = Math.max(
      0,
      viewport.parentRect.maxX() - width,
      viewport.parentRect.minX(),
    )

    let y: number
    if (placement === 'below') {
      y = viewport.parentRect.maxY()
    } else {
      y = viewport.parentRect.minY() - height
    }

    this.#box.border = BORDERS[placement]

    const rect = new Rect(new Point(x, y), new Size(width, height))
    viewport.clipped(rect, inside => this.renderChildren(inside))
  }
}

function dropdownSelectedRows<T>(
  selected: T | readonly T[] | undefined,
  choices: Choices<T>,
  multiple: boolean,
): number[] {
  let selectedItems: T[]
  if (multiple) {
    selectedItems = selected as T[]
  } else if (selected !== undefined) {
    selectedItems = [selected as T]
  } else {
    return []
  }

  return selectedItems.flatMap(item => {
    const index = choices.findIndex(([_, choice]) => choice === item)
    if (index === -1) {
      return []
    }

    return [index]
  })
}

function dropdownPrefix(multiple: boolean, index: number, isSelected: boolean) {
  if (index === 0) {
    return '  '
  }

  if (multiple) {
    return isSelected ? BOX.multiple.checked : BOX.multiple.unchecked
  } else {
    return isSelected ? BOX.single.checked : BOX.single.unchecked
  }
}

const BORDERS: BorderChars = {
  control: ['─', '│', '╭', '┬─╮', '╰', '┴─╯'],
  hover: ['─', '│', '╭', '┬─╮', '╰', '┴─╯', '─', '│'],
  below: ['─', '│', '╭', '┬─╮', '╰', '┴─╯', '─', '│'],
  above: ['─', '│', '╭', '┬─╮', '╰', '┴─╯', '─', '│'],
}

const BOX: Record<
  'multiple' | 'single',
  Record<'unchecked' | 'checked', string>
> = {
  multiple: {
    unchecked: '☐ ',
    checked: '☑ ',
  },
  single: {
    unchecked: '◯ ',
    checked: '⦿ ',
  },
}
