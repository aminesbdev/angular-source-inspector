import {Component} from '@angular/core';
import {ProductCard} from './product-card/product-card';
import {PriceTag} from './price-tag';

@Component({
  selector: 'app-root',
  imports: [ProductCard, PriceTag],
  styleUrl: './app.css',
  templateUrl: './app.html',
})
export class App {
  protected readonly products = [
    {name: 'Keyboard', price: 89},
    {name: 'Mouse', price: 39},
  ];
}
