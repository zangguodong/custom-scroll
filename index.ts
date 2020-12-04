import {
  CdkVirtualScrollViewport,
  VIRTUAL_SCROLL_STRATEGY,
  VirtualScrollStrategy,
} from '@angular/cdk/scrolling';
import {
  ChangeDetectorRef,
  Directive,
  Input,
  OnChanges,
  forwardRef,
} from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';

export class AdaptiveHeightStrategy implements VirtualScrollStrategy {
  private _scrolledIndexChange = new Subject<number>();

  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  scrolledIndexChange: Observable<number> = this._scrolledIndexChange.pipe(
    distinctUntilChanged(),
  );

  /** The attached viewport. */
  private _viewport: CdkVirtualScrollViewport | null = null;

  /** The size of the items in the virtually scrolling list. */
  private _itemSizeFn: (data: unknown) => number;

  private _items: unknown[];

  /** The minimum amount of buffer rendered beyond the viewport (in pixels). */
  private _minBufferPx: number;

  /** The number of buffer items to render beyond the edge of the viewport (in pixels). */
  private _maxBufferPx: number;

  /**
   * @param itemSize The size of the items in the virtually scrolling list.
   * @param items 输入数据源
   * @param minBufferPx The minimum amount of buffer (in pixels) before needing to render more
   * @param maxBufferPx The amount of buffer (in pixels) to render when rendering more.
   */
  constructor(
    itemSizeFn: (data: unknown) => number,
    items: unknown[],
    minBufferPx: number,
    maxBufferPx: number,
  ) {
    this._itemSizeFn = itemSizeFn;
    this._items = items;
    this._minBufferPx = minBufferPx;
    this._maxBufferPx = maxBufferPx;
  }

  /**
   * Attaches this scroll strategy to a viewport.
   * @param viewport The viewport to attach this strategy to.
   */
  attach(viewport: CdkVirtualScrollViewport) {
    this._viewport = viewport;
    this._updateTotalContentSize();
    this._updateRenderedRange();
  }

  /** Detaches this scroll strategy from the currently attached viewport. */
  detach() {
    this._scrolledIndexChange.complete();
    this._viewport = null;
  }

  /**
   * Update the item size and buffer size.
   * @param itemSize The size of the items in the virtually scrolling list.
   * @param minBufferPx The minimum amount of buffer (in pixels) before needing to render more
   * @param maxBufferPx The amount of buffer (in pixels) to render when rendering more.
   */
  updateItemAndBufferSize(
    itemSizeFn: (item: unknown) => number,
    items: unknown[],
    minBufferPx: number,
    maxBufferPx: number,
  ) {
    if (maxBufferPx < minBufferPx) {
      throw Error(
        'CDK virtual scroll: maxBufferPx must be greater than or equal to minBufferPx',
      );
    }
    this._items = items;
    this._itemSizeFn = itemSizeFn;
    this._minBufferPx = minBufferPx;
    this._maxBufferPx = maxBufferPx;
    this._updateTotalContentSize();
    this._updateRenderedRange();
  }

  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  onContentScrolled() {
    this._updateRenderedRange();
  }

  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  onDataLengthChanged() {
    this._updateTotalContentSize();
    this._updateRenderedRange();
  }

  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  onContentRendered() {
    /* no-op */
  }

  /** @docs-private Implemented as part of VirtualScrollStrategy. */
  onRenderedOffsetChanged() {
    /* no-op */
  }

  /**
   * Scroll to the offset for the given index.
   * @param index The index of the element to scroll to.
   * @param behavior The ScrollBehavior to use when scrolling.
   */
  scrollToIndex(index: number, behavior: ScrollBehavior): void {
    if (this._viewport) {
      this._viewport.scrollToOffset(
        this._getItemSize(this._items.slice(0, index)),
        behavior,
      );
    }
  }

  /** Update the viewport's total content size. */
  private _updateTotalContentSize() {
    if (!this._viewport) {
      return;
    }
    this._viewport.setTotalContentSize(this._getItemSize(this._items));
  }

  private _getItemSize(data: any[]): number {
    return data?.reduce(
      (acc, curr) => this._itemSizeFn(curr) + (acc as number),
      0,
    );
  }

  private _getFirstVisibleIndex(offset: number) {
    let acc = 0;
    let ind = 0;
    this._items?.forEach(curr => {
      if (acc > offset) {
        return;
      } else {
        acc += this._itemSizeFn(curr);
        ind += 1;
      }
    });
    return ind;
  }

  /** Update the viewport's rendered range. */
  private _updateRenderedRange() {
    if (!this._viewport) {
      return;
    }

    const scrollOffset = this._viewport.measureScrollOffset();
    const firstVisibleIndex = this._getFirstVisibleIndex(scrollOffset);

    const renderedRange = this._viewport.getRenderedRange();
    const newRange = { start: renderedRange.start, end: renderedRange.end };
    const viewportSize = this._viewport.getViewportSize();
    const dataLength = this._viewport.getDataLength();

    const startBuffer =
      scrollOffset - this._getItemSize(this._items?.slice(0, newRange.start));
    if (startBuffer < this._minBufferPx && newRange.start != 0) {
      const expandStart = Math.ceil(
        this._getFirstVisibleIndex(this._maxBufferPx - startBuffer),
      );
      newRange.start = Math.max(0, newRange.start - expandStart);

      newRange.end = Math.min(
        dataLength,
        Math.ceil(
          firstVisibleIndex +
            this._getFirstVisibleIndex(viewportSize + this._minBufferPx),
        ),
      );
    } else {
      const endBuffer =
        this._getItemSize(this._items?.slice(0, newRange.end)) -
        (scrollOffset + viewportSize);
      if (endBuffer < this._minBufferPx && newRange.end != dataLength) {
        const expandEnd = Math.ceil(
          this._getFirstVisibleIndex(this._maxBufferPx - endBuffer),
        );

        if (expandEnd > 0) {
          newRange.end = Math.min(dataLength, newRange.end + expandEnd);

          newRange.start = Math.max(
            0,
            firstVisibleIndex - this._getFirstVisibleIndex(this._minBufferPx),
          );
        }
      }
    }
    this._viewport.setRenderedRange(newRange);
    this._viewport.setRenderedContentOffset(
      this._getItemSize(this._items.slice(0, newRange.start)),
    );
    this._scrolledIndexChange.next(Math.floor(firstVisibleIndex));
  }
}

/**
 * Provider factory for `FixedSizeVirtualScrollStrategy` that simply extracts the already created
 * `FixedSizeVirtualScrollStrategy` from the given directive.
 * @param fixedSizeDir The instance of `CdkFixedSizeVirtualScroll` to extract the
 *     `FixedSizeVirtualScrollStrategy` from.
 */
export function _fixedSizeVirtualScrollStrategyFactory(
  fixedSizeDir: CdkReactiveSizeVirtualScroll,
) {
  return fixedSizeDir._scrollStrategy;
}

/** A virtual scroll strategy that supports reactive-size items. */
@Directive({
  selector: 'cdk-virtual-scroll-viewport[itemSizeFn][items]',
  providers: [
    {
      provide: VIRTUAL_SCROLL_STRATEGY,
      useFactory: _fixedSizeVirtualScrollStrategyFactory,
      deps: [forwardRef(() => CdkReactiveSizeVirtualScroll)],
    },
  ],
})
export class CdkReactiveSizeVirtualScroll implements OnChanges {
  /** The size function of the items in the list (in pixels). */
  @Input()
  itemSizeFn: (data: unknown) => number = () => 20;

  @Input()
  items: unknown[] = [];

  /**
   * The minimum amount of buffer rendered beyond the viewport (in pixels).
   * If the amount of buffer dips below this number, more items will be rendered. Defaults to 100px.
   */
  @Input()
  get minBufferPx(): number {
    return this._minBufferPx;
  }
  set minBufferPx(value: number) {
    this._minBufferPx = value;
  }
  _minBufferPx = 100;

  constructor(private cdr: ChangeDetectorRef) {}

  /**
   * The number of pixels worth of buffer to render for when rendering new items. Defaults to 200px.
   */
  @Input()
  get maxBufferPx(): number {
    return this._maxBufferPx;
  }
  set maxBufferPx(value: number) {
    this._maxBufferPx = value;
  }
  _maxBufferPx = 200;

  // 下游会使用这个 public 成员
  /** The scroll strategy used by this directive. */
  _scrollStrategy = new AdaptiveHeightStrategy(
    this.itemSizeFn,
    this.items,
    this.minBufferPx,
    this.maxBufferPx,
  );

  ngOnChanges() {
    this._scrollStrategy.updateItemAndBufferSize(
      this.itemSizeFn,
      this.items,
      this.minBufferPx,
      this.maxBufferPx,
    );
    this.cdr.detectChanges();
  }
}
