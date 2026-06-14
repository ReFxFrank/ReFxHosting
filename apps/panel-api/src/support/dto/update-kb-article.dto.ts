import { PartialType } from '@nestjs/swagger';
import { CreateKbArticleDto } from './create-kb-article.dto';

/**
 * Staff patch of a KB article. All fields optional; only supplied fields are
 * updated (PATCH semantics).
 */
export class UpdateKbArticleDto extends PartialType(CreateKbArticleDto) {}
