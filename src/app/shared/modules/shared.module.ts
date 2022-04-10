import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ComponentsModule } from '../components/components.module';
import { DirectivesModule } from '../directives/directives.module';
import { PipesModule } from '../pipes/pipes.module';
import { RouterModule } from '@angular/router';

@NgModule({
  declarations: [

  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PipesModule,
    DirectivesModule,
    ComponentsModule,
    RouterModule,
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PipesModule,
    DirectivesModule,
    ComponentsModule,
    RouterModule,
  ]
})
export class SharedModule { }
