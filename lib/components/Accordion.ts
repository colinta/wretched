import {Container, type Props as ContainerProps} from '../Container'
import {interpolate, Point, Rect, Size} from '../geometry'
import {View} from '../View'
import {Text} from './Text'
import {Viewport} from '../Viewport'
import {System} from '../System'
import {type MouseEvent, isMouseClicked} from '../events'
import {Style} from '../Style'

interface Props extends ContainerProps {
  multiple?: boolean
}

interface SectionProps extends ContainerProps {
  title?: string
  view: View
  isOpen?: boolean
  onClick?: (section: AccordionSection, isOpen: boolean) => void
}

// accordion = new Accordion()
// accordion.addSection('title1', section1)
// accordion.addSection(new Text({text: 'title2', style: …}), section2)
//
// accordion = Accordion.create([
//   ['title1', section1],
//   ['title2', section2],
//   Accordion.Section('title3', section3),
// ])
//
// accordion.add(new AccordionSection()) // well behaved
// accordion.add(new View()) // undefined behaviour
export class Accordion extends Container {
  static Section: typeof AccordionSection

  #multiple = false

  static create(
    sections: ([string, View] | AccordionSection)[],
    extraProps: Props = {},
  ): Accordion {
    const accordion = new Accordion(extraProps)
    for (const section of sections) {
      if (section instanceof AccordionSection) {
        accordion.addSection(section)
      } else {
        const [title, view] = section as [string, View]
        accordion.addSection(title, view)
      }
    }

    return accordion
  }

  constructor(props: Props = {}) {
    super(props)

    this.#update(props)
  }

  update(props: Props) {
    this.#update(props)
    super.update(props)
  }

  #update({multiple}: Props) {
    this.#multiple = multiple ?? false
  }

  get sections() {
    return this.children.filter(view => view instanceof AccordionSection)
  }

  #sectionDidChange(toggleSection: AccordionSection, isOpen: boolean) {
    if (this.#multiple || !isOpen) {
      return
    }

    for (const section of this.sections) {
      if (toggleSection === section) {
        continue
      }

      section.close()
    }
  }

  addSection(title: string, view: View): void
  addSection(section: AccordionSection): void
  addSection(titleOrSection: string | AccordionSection, view?: View) {
    let sectionView: AccordionSection
    if (titleOrSection instanceof AccordionSection) {
      sectionView = titleOrSection
    } else {
      sectionView = AccordionSection.create(
        titleOrSection as string,
        view as View,
      )
    }

    const onClick = this.#sectionDidChange.bind(this)
    sectionView.onClick = onClick
    if (!this.#multiple && sectionView.isOpen) {
      this.sections.forEach(section => (section.isOpen = false))
    }

    this.add(sectionView)
  }

  naturalSize(availableSize: Size): Size {
    let remainingSize = availableSize
    return this.sections.reduce((size, section) => {
      const sectionSize = section.naturalSize(remainingSize)
      remainingSize = remainingSize.shrink(0, sectionSize.height)
      return new Size(
        Math.max(sectionSize.width, size.width),
        size.height + sectionSize.height,
      )
    }, Size.zero.mutableCopy())
  }

  render(viewport: Viewport) {
    let remainingSize = viewport.contentSize

    let y = 0
    for (const section of this.sections) {
      if (y >= viewport.visibleRect.maxY()) {
        break
      }

      const sectionSize = section.naturalSize(remainingSize)
      remainingSize = remainingSize.shrink(0, sectionSize.height)
      viewport.clipped(
        new Rect([0, y], [remainingSize.width, sectionSize.height]),
        inner => {
          section.render(inner)
        },
      )
      y += sectionSize.height
    }
  }
}

class AccordionSection extends Container {
  #isOpen = false
  onClick: ((section: AccordionSection, isOpen: boolean) => void) | undefined

  #currentViewHeight = 0
  #actualViewHeight = 0

  #titleView: Text
  #view: View

  static create(
    title: string,
    view: View,
    extraProps: Omit<SectionProps, 'title' | 'view'> = {},
  ) {
    return new AccordionSection({title, view, ...extraProps})
  }

  declare title: string

  constructor({title, view, isOpen, ...props}: SectionProps) {
    super(props)

    this.#view = view
    this.#isOpen = isOpen ?? false

    this.#titleView = new Text({
      text: title ?? '',
      style: this.titleStyle,
    })

    this.#update({isOpen})

    this.add(this.#titleView)
    this.add(view)

    Object.defineProperty(this, 'title', {
      enumerable: true,
      get() {
        return this.#titleView.text
      },
      set(value: string) {
        this.#titleView.text = value
      },
    })
  }

  get isOpen() {
    return this.#isOpen
  }

  set isOpen(value: boolean) {
    if (this.#isOpen === value) {
      return
    }

    this.#isOpen = value
    this.#titleView.style = this.titleStyle
    this.onClick?.(this, value)
  }

  get titleStyle() {
    return new Style({underline: true, bold: this.#isOpen})
  }

  open() {
    this.isOpen = true
  }

  close() {
    this.isOpen = false
  }

  update(props: Omit<SectionProps, 'view'>) {
    this.#update(props)
    super.update(props)
  }

  #update({isOpen, onClick}: Omit<SectionProps, 'view'>) {
    this.#isOpen = isOpen ?? false
    this.onClick = onClick
  }

  naturalSize(availableSize: Size) {
    // 4 => left margin, right space/arrow/space
    // 1 => bottom separator
    const collapsedSize = this.#titleView.naturalSize(availableSize).grow(4, 1)
    const remainingSize = availableSize.shrink(0, collapsedSize.height)
    // 1 => left margin (no right margin)
    const viewSize = this.#view.naturalSize(remainingSize).grow(1, 0)
    return this.#currentSize(collapsedSize, viewSize)
  }

  #currentSize(collapsedSize: Size, viewSize: Size) {
    if (this.#actualViewHeight === 0) {
      this.#currentViewHeight = this.#isOpen ? viewSize.height : 0
    }

    this.#actualViewHeight = viewSize.height

    return new Size(
      Math.max(viewSize.width, collapsedSize.width),
      collapsedSize.height + Math.round(this.#currentViewHeight),
    )
  }

  receiveMouse(event: MouseEvent, system: System) {
    super.receiveMouse(event, system)

    if (isMouseClicked(event)) {
      this.#isOpen = !this.#isOpen
      this.#titleView.style = this.titleStyle
      this.onClick?.(this, this.#isOpen)
    }
  }

  receiveTick(dt: number): boolean {
    if (this.#actualViewHeight === 0) {
      this.#currentViewHeight = 0
      return false
    }

    const amount = dt / 25
    let nextHeight: number
    if (this.#isOpen) {
      nextHeight = Math.min(
        this.#actualViewHeight,
        this.#currentViewHeight + amount,
      )
    } else {
      nextHeight = Math.max(0, this.#currentViewHeight - amount)
    }

    this.#currentViewHeight = nextHeight
    this.invalidateSize()

    return true
  }

  render(viewport: Viewport) {
    if (
      this.#currentViewHeight !== (this.#isOpen ? this.#actualViewHeight : 0)
    ) {
      viewport.registerTick()
    }

    viewport.registerMouse(['mouse.button.left', 'mouse.move'])

    const textStyle = this.theme.text()
    const textSize = this.#titleView
      .naturalSize(viewport.contentSize)
      .mutableCopy()
    textSize.width = Math.max(
      0,
      Math.min(viewport.contentSize.width - 4, textSize.width),
    )

    viewport.clipped(
      Rect.zero.atX(1).withSize(viewport.contentSize.width, textSize.height),
      inner => {
        this.#titleView.render(inner)
      },
    )

    if (this.#currentViewHeight > 0) {
      viewport.clipped(
        Rect.zero
          .atY(textSize.height)
          .withSize(viewport.contentSize.width, this.#currentViewHeight),
        inner => {
          this.#view.render(inner)
        },
      )
    }

    viewport.clipped(
      Rect.zero
        .at(viewport.contentSize.width - 3, 0)
        .withSize(viewport.contentSize.width, 1),
      textStyle,
      inner => {
        if (
          this.#currentViewHeight !==
          (this.#isOpen ? this.#actualViewHeight : 0)
        ) {
          const arrows = this.isHover ? ARROWS.animateHover : ARROWS.animate
          const index = Math.round(
            interpolate(
              this.#currentViewHeight,
              [0, this.#actualViewHeight],
              [0, arrows.length - 1],
            ),
          )
          inner.write(arrows[index], new Point(1, 0))
        } else if (this.#isOpen) {
          inner.write(
            this.isHover ? ARROWS.openHover : ARROWS.open,
            new Point(1, 0),
          )
        } else {
          inner.write(
            this.isHover ? ARROWS.closedHover : ARROWS.closed,
            new Point(1, 0),
          )
        }
      },
    )

    viewport.clipped(
      Rect.zero
        .at(0, viewport.contentSize.height - 1)
        .withSize(viewport.contentSize.width, 1),
      textStyle,
      inner => {
        inner.write(SEPARATOR.left, new Point(0, 0))
        if (inner.contentSize.width > 2) {
          const middle = SEPARATOR.middle.repeat(inner.contentSize.width - 2)
          inner.write(middle, new Point(1, 0))
        }
        inner.write(SEPARATOR.right, new Point(inner.contentSize.width - 1, 0))
      },
    )
  }
}

Accordion.Section = AccordionSection

const ARROWS = {
  open: '△',
  openHover: '▲',
  closed: '▽',
  closedHover: '▼',
  animate: ['▽', '◁', '△'],
  animateHover: ['▼', '◀︎', '▲'],
}
const SEPARATOR = {left: '╶', middle: '─', right: '╴'}

/* ▷▶︎ ◀︎◁ ▼▽ ▲△

 S͟e͟c͟t͟i͟o͟n͟ ͟1   ▽
╶─────────────╴
 S͟e͟c͟t͟i͟o͟n͟ ͟2   ▼  // hover
╶─────────────╴
 S͟e͟c͟t͟i͟o͟n͟ ͟3   △  // open
Content........
goes here......
╶─────────────╴
 S͟e͟c͟t͟i͟o͟n͟ ͟3   ▽   ◺ ◁ ◸ △ // animation
╶─────────────╴

*/