import {Component, input} from '@angular/core';

@Component({
  selector: 'app-price-tag',
  template: `
    <span class="price">
      <strong>{{ amount() }}</strong> EUR
    </span>
  `,
})
export class PriceTag {
  readonly amount = input.required<number>();
}
