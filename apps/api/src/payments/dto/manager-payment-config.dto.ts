import { IsBoolean, IsOptional } from 'class-validator';
import { UpsertPaymentConfigDto } from '../../admin/dto/upsert-payment-config.dto';

/**
 * DTO — configuration du paiement par l'ORGANISATEUR (2026-08-24).
 *
 * Reprend celui de l'Admin — mêmes fournisseurs, mêmes identifiants, mêmes
 * règles de validation — et lui ajoute la seule chose que l'Admin n'avait pas
 * besoin de dire : la portée.
 */
export class ManagerPaymentConfigDto extends UpsertPaymentConfigDto {
  /**
   * « Appliquer à tous mes événements ».
   *
   * Recopie ces identifiants sur chaque événement de l'organisateur, et sur
   * ceux qu'il créera ensuite. Absent ou faux, la configuration ne vaut que
   * pour l'événement sélectionné.
   */
  @IsOptional()
  @IsBoolean()
  global?: boolean;
}
