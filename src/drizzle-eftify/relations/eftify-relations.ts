import { and, AnyColumn, AnyTable, entityKind, eq, Equal, Many, One, Relation, RelationConfig, relations, Relations, sql, Table } from "drizzle-orm";
import { DbQueryRelationBuildSqlArgs } from "../db-query-relation";

declare function createTableRelationsHelpersEftify<TTableName extends string>(sourceTable: AnyTable<{
    name: TTableName;
}>): {
    one: <TForeignTable extends Table, TColumns extends [AnyColumn<{
        tableName: TTableName;
    }>, ...AnyColumn<{
        tableName: TTableName;
    }>[]]>(table: TForeignTable, config?: CustomRelationConfig<TTableName, TForeignTable["_"]["name"], TColumns> | undefined) => One<TForeignTable["_"]["name"], Equal<TColumns[number]["_"]["notNull"], true>>;
    many: <TForeignTable extends Table>(referencedTable: TForeignTable, config?: {
        relationName: string;
    }) => Many<TForeignTable["_"]["name"]>;
    manyCustomDefined: <TForeignTable extends Table, TColumns extends [AnyColumn<{
        tableName: TTableName;
    }>, ...AnyColumn<{
        tableName: TTableName;
    }>[]]>(table: TForeignTable, config?: RelationConfig<TTableName, TForeignTable["_"]["name"], TColumns> & { mandatory?: boolean } | undefined) => Many<TForeignTable["_"]["name"]>;
    manyFromKeyArray: <TForeignTable extends Table, TColumns extends [AnyColumn<{
        tableName: TTableName;
    }>, ...AnyColumn<{
        tableName: TTableName;
    }>[]]>(table: TForeignTable, config?: RelationConfig<TTableName, TForeignTable["_"]["name"], TColumns> & { mandatory?: boolean } | undefined) => Many<TForeignTable["_"]["name"]>;
};
export type EftifyTableRelationsHelpers<TTableName extends string> = ReturnType<typeof createTableRelationsHelpersEftify<TTableName>>;

const enum ManyCustomDefinedMode {
    NORMAL = 0,
    ARRAY = 1
}

class ManyCustomDefined<
    TTableName extends string = string,
    TIsNullable extends boolean = boolean,
> extends Relation<TTableName> {
    static override readonly [entityKind]: string = 'ManyCustomDefined';
    declare protected $relationBrand: 'ManyCustomDefined';

    type = 'many';
    _custom = true;
    _relationMode = 0;

    constructor(
        sourceTable: Table,
        referencedTable: AnyTable<{ name: TTableName }>,
        readonly config:
            | RelationConfig<
                TTableName,
                string,
                AnyColumn<{ tableName: TTableName }>[]
            >
            | undefined,
        readonly isNullable: TIsNullable,
        readonly buildJoinSql: any,
        readonly normalizedRelation: any
    ) {
        super(sourceTable, referencedTable, config?.relationName);
        this._relationMode = (config as any)?._relationMode ?? ManyCustomDefinedMode.NORMAL;
    }

    static createFromConfig(helpers: any, table: Table, config: any) {
        const builtObj: any = helpers.one(table, config);

        return new ManyCustomDefined(
            builtObj.sourceTable,
            builtObj.referencedTable,
            config,
            config.mandatory != true,
            (args: DbQueryRelationBuildSqlArgs) => {
                return and(
                    ...args.keyPairs.map((field, i) => {
                        const childCol = args.childEntity.table[field[1]];
                        const parentCol = args.callingEntity.table[field[0]];

                        if (config._relationMode == ManyCustomDefinedMode.ARRAY) {
                            if (childCol.columnType == 'PgArray') {
                                return eq(parentCol, sql`ANY(${childCol})`)
                            } else {
                                return eq(childCol, sql`ANY(${parentCol})`)
                            }
                        } else {
                            return eq(parentCol, childCol);
                        }
                    })
                );
            },
            {
                fields: config.fields,
                references: config.references
            }
        )
    }

    withFieldName(fieldName: string): ManyCustomDefined<TTableName> {
        const relation = new ManyCustomDefined(
            this.sourceTable,
            this.referencedTable,
            this.config,
            this.isNullable,
            this.buildJoinSql,
            this.normalizedRelation
        );
        relation.fieldName = fieldName;
        return relation;
    }
}

export interface CustomRelationConfig<TTableName extends string, TForeignTableName extends string, TColumns extends AnyColumn<{
    tableName: TTableName;
}>[]> extends RelationConfig<TTableName, TForeignTableName, TColumns> {
    mandatory?: boolean
}

export class OneCustomDefined<
    TTableName extends string = string,
    TIsNullable extends boolean = boolean,
> extends Relation<TTableName> {
    static override readonly [entityKind]: string = 'OneCustomDefined';
    declare protected $relationBrand: 'OneCustomDefined';

    constructor(
        sourceTable: Table,
        referencedTable: AnyTable<{ name: TTableName }>,
        readonly config:
            | CustomRelationConfig<
                TTableName,
                string,
                AnyColumn<{ tableName: TTableName }>[]
            >
            | undefined,
        readonly isNullable: TIsNullable,
    ) {
        super(sourceTable, referencedTable, config?.relationName);
    }

    withFieldName(fieldName: string): OneCustomDefined<TTableName> {
        const relation = new OneCustomDefined(
            this.sourceTable,
            this.referencedTable,
            this.config,
            this.isNullable,
        );
        relation.fieldName = fieldName;
        return relation;
    }
}



export function eftifyRelations<TTableName extends string, TRelations extends Record<string, Relation<any>>>(table: AnyTable<{
    name: TTableName;
}>, relationConfig: (helpers: EftifyTableRelationsHelpers<TTableName> & { cust: string }) => TRelations): Relations<TTableName, TRelations> {
    return (relations as typeof eftifyRelations)(table, (helpers) => {
        const oldOne = helpers.one;

        (helpers as any).manyFromKeyArray = (table: any, config: any) => {
            if (config == null) {
                config = {};
            }

            config._relationMode = ManyCustomDefinedMode.ARRAY;
            return ManyCustomDefined.createFromConfig(helpers, table, config);
        };

        (helpers as any).manyCustomDefined = (table: any, config: any) => {
            if (config == null) {
                config = {};
            }

            config._relationMode = ManyCustomDefinedMode.NORMAL;
            return ManyCustomDefined.createFromConfig(helpers, table, config);
        };

        (helpers as any).one = (table: any, config: any) => {
            const builtObj: any = oldOne(table, config);
            if (config?.mandatory == null) {
                return builtObj;
            }

            if (config == null) {
                config = {};
            }

            return new One(
                builtObj.sourceTable,
                builtObj.referencedTable,
                config,
                config.mandatory != true
            );
        };

        return relationConfig(helpers);
    });
}
