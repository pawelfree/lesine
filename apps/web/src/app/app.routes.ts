import { Routes } from '@angular/router';
import { DataPage } from './data';
import { Home } from './home';

export const routes: Routes = [
  { path: '', component: Home },
  { path: 'data', component: DataPage },
];
