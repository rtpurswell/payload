/* eslint-disable no-param-reassign */
import { Field } from 'payload/types';
import toSnakeCase from 'to-snake-case';
import { fieldAffectsData, valueIsValueWithRelation } from 'payload/dist/fields/config/types';
import { ArrayRowToInsert, BlockRowToInsert } from './types';
import { isArrayOfRows } from '../../utilities/isArrayOfRows';
import { transformArray } from './array';

type Args = {
  arrays: {
    [tableName: string]: ArrayRowToInsert[]
  }
  blocks: {
    [blockType: string]: BlockRowToInsert[]
  }
  columnPrefix: string
  data: Record<string, unknown>
  existingLocales?: Record<string, unknown>[]
  fields: Field[]
  forceLocalized?: boolean
  locale: string
  locales: {
    [locale: string]: Record<string, unknown>
  }
  newTableName: string
  parentTableName: string
  path: string
  relationships: Record<string, unknown>[]
  row: Record<string, unknown>
}

export const traverseFields = ({
  arrays,
  blocks,
  columnPrefix,
  data,
  existingLocales,
  fields,
  forceLocalized,
  locale,
  locales,
  newTableName,
  parentTableName,
  path,
  relationships,
  row,
}: Args) => {
  fields.forEach((field) => {
    let columnName = '';
    let fieldData: unknown;

    if (fieldAffectsData(field)) {
      columnName = `${columnPrefix || ''}${field.name}`;
      fieldData = data[field.name];
    }

    if (field.type === 'array') {
      const arrayTableName = `${newTableName}_${toSnakeCase(field.name)}`;
      if (!arrays[arrayTableName]) arrays[arrayTableName] = [];

      if (field.localized) {
        if (typeof data[field.name] === 'object' && data[field.name] !== null) {
          // loop over each locale
          console.log(data[field.name]);
        }
      } else {
        const newRows = transformArray({
          arrayTableName,
          blocks,
          columnName,
          data: data[field.name],
          field,
          locale,
          path,
          relationships,
        });

        arrays[arrayTableName] = arrays[arrayTableName].concat(newRows);
      }

      return;
    }

    if (field.type === 'blocks') {
      if (field.localized) {
        if (typeof data[field.name] === 'object' && data[field.name] !== null) {
          // loop over each locale
          console.log(data[field.name]);
        }
      } else if (isArrayOfRows(fieldData)) {
        fieldData.forEach((blockRow, i) => {
          if (typeof blockRow.blockType !== 'string') return;
          const matchedBlock = field.blocks.find(({ slug }) => slug === blockRow.blockType);
          if (!matchedBlock) return;

          if (!blocks[blockRow.blockType]) blocks[blockRow.blockType] = [];

          const newRow: BlockRowToInsert = {
            arrays: {},
            row: {
              _order: i + 1,
              _path: `${path}${field.name}`,
            },
            locales: {},
          };

          if (field.localized) newRow.row._locale = locale;

          const blockTableName = `${newTableName}_${toSnakeCase(blockRow.blockType)}`;

          traverseFields({
            arrays: newRow.arrays,
            blocks,
            columnPrefix: '',
            data: blockRow,
            fields: matchedBlock.fields,
            locale,
            locales: newRow.locales,
            newTableName: blockTableName,
            parentTableName: blockTableName,
            path: `${path || ''}${field.name}.${i}.`,
            relationships,
            row: newRow.row,
          });

          blocks[blockRow.blockType].push(newRow);
        });
      }

      return;
    }

    if (field.type === 'group') {
      if (typeof data[field.name] === 'object' && data[field.name] !== null) {
        let targetData = data[field.name];
        if (field.localized && typeof data[field.name][locale] === 'object' && data[field.name][locale] !== null) {
          targetData = data[field.name][locale];
        }

        traverseFields({
          arrays,
          blocks,
          columnPrefix: `${columnName}_`,
          data: targetData as Record<string, unknown>,
          existingLocales,
          fields: field.fields,
          forceLocalized: field.localized,
          locale,
          locales,
          newTableName: `${parentTableName}_${toSnakeCase(field.name)}`,
          parentTableName,
          path: `${path || ''}${field.name}.`,
          relationships,
          row,
        });
      }

      return;
    }

    if (field.type === 'relationship') {
      const baseRelationRow: Record<string, unknown> = {
        path: `${path || ''}${field.name}`,
      };

      if (field.localized && typeof fieldData === 'object') {
        if (locale in fieldData) {
          baseRelationRow.locale = locale;
          fieldData = fieldData[locale];
        } else {
          return;
        }
      }

      const relations = Array.isArray(fieldData) ? fieldData : [fieldData];

      relations.forEach((relation, i) => {
        if (relation) {
          const relationRow = { ...baseRelationRow };
          if ('hasMany' in field && field.hasMany) relationRow.order = i + 1;

          if (Array.isArray(field.relationTo) && valueIsValueWithRelation(relation)) {
            relationRow[`${relation.relationTo}ID`] = relation.value;
            relationships.push(relationRow);
          } else {
            relationRow[`${field.relationTo}ID`] = relation;
            if (relation) relationships.push(relationRow);
          }
        }
      });

      return;
    }

    if (fieldAffectsData(field)) {
      const valuesToTransform: { localeKey?: string, ref: unknown, value: unknown }[] = [];

      if ((field.localized || forceLocalized)) {
        if (typeof fieldData === 'object' && fieldData !== null) {
          Object.entries(fieldData).forEach(([localeKey, localeData]) => {
            if (!locales[localeKey]) locales[localeKey] = {};

            valuesToTransform.push({
              localeKey,
              ref: locales,
              value: localeData,
            });
          });
        }
      } else {
        valuesToTransform.push({ value: fieldData, ref: row });
      }

      valuesToTransform.forEach(({ localeKey, ref, value }) => {
        if (typeof value !== 'undefined') {
          let formattedValue = value;

          switch (field.type) {
            case 'number': {
              // TODO: handle hasMany
              break;
            }

            case 'select': {
              break;
            }

            case 'date': {
              if (typeof fieldData === 'string') {
                const parsedDate = new Date(fieldData);
                formattedValue = parsedDate;
              }

              break;
            }

            // case 'tabs': {
            //   await Promise.all(field.tabs.map(async (tab) => {
            //     if ('name' in tab) {
            //       if (typeof data[tab.name] === 'object' && data[tab.name] !== null) {
            //         await traverseFields({
            //           adapter,
            //           arrayRowPromises,
            //           blockRows,
            //           columnPrefix: `${columnName}_`,
            //           data: data[tab.name] as Record<string, unknown>,
            //           fields: tab.fields,
            //           locale,
            //           localeRow,
            //           operation,
            //           path: `${path || ''}${tab.name}.`,
            //           relationshipRows,
            //           row,
            //           tableName,
            //         });
            //       }
            //     } else {
            //       await traverseFields({
            //         adapter,
            //         arrayRowPromises,
            //         blockRows,
            //         columnPrefix,
            //         data,
            //         fields: tab.fields,
            //         locale,
            //         localeRow,
            //         operation,
            //         path,
            //         relationshipRows,
            //         row,
            //         tableName,
            //       });
            //     }
            //   }));
            //   break;
            // }

            // case 'row':
            // case 'collapsible': {
            //   await traverseFields({
            //     adapter,
            //     arrayRowPromises,
            //     blockRows,
            //     columnPrefix,
            //     data,
            //     fields: field.fields,
            //     locale,
            //     localeRow,
            //     operation,
            //     path,
            //     relationshipRows,
            //     row,
            //     tableName,
            //   });
            //   break;
            // }

            default: {
              break;
            }
          }

          if (localeKey) {
            ref[localeKey][columnName] = formattedValue;
          } else {
            ref[columnName] = formattedValue;
          }
        }
      });
    }
  });
};