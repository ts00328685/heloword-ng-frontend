import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ComponentsModule } from '../components/components.module';
import { DirectivesModule } from '../directives/directives.module';
import { PipesModule } from '../pipes/pipes.module';
import { RouterModule } from '@angular/router';
import { IonicModule } from '@ionic/angular';

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
    DirectivesModule,
    IonicModule
  ],
  exports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PipesModule,
    DirectivesModule,
    ComponentsModule,
    RouterModule,
    DirectivesModule,
    IonicModule
  ]
})
export class SharedModule { }
