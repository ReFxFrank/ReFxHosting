import { PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

/** Admin payload to edit a ticket category (all fields optional). */
export class UpdateCategoryDto extends PartialType(CreateCategoryDto) {}
