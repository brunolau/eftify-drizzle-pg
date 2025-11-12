import { SQL, SQLChunk, SelectedFields, StringChunk, ValueOrArray, and, sql } from 'drizzle-orm'
import { SelectionProxyHandler } from 'drizzle-orm/selection-proxy'
import { DbQueryCommon } from '../db-query-common'
import { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import { AnyPgColumn } from 'drizzle-orm/pg-core'
import { SelectResult } from 'drizzle-orm/query-builders/select.types'
import { EftifyCollectionJoinDeclaration } from '../data-contracts'
import { GroupedDbCollectionQueryable } from '../grouping/grouped-db-collection-queryable'

let counter = 0

export class DbCollectionQueryable<TSelection extends SelectedFields<any, any>> {
	private _db: PostgresJsDatabase<any>
	private _baseQuery: any
	private _level: number

	constructor(db: PostgresJsDatabase<any>, baseQuery: any, level: number) {
		this._db = db
		this._level = level
		this._baseQuery = baseQuery
	}

	count(): SQL<number> {
		const id = `fnlsq${counter++}`
		const subq = this._baseQuery.as(id)
		return sql<number>`(SELECT COUNT(*) from ${subq})`
	}

	sum(
		builder: (aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>,
		alias?: string
	): SQL<number> {
		return this.buildAggregationQuery(builder, 'sum', alias);
	}

	min(
		builder: (aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>,
		alias?: string
	): SQL<number> {
		return this.buildAggregationQuery(builder, 'min', alias);
	}

	max(
		builder: (aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>,
		alias?: string
	): SQL<number> {
		return this.buildAggregationQuery(builder, 'max', alias);
	}

	select<TResult extends SelectedFields<any, any>>(selector: (value: TSelection) => TResult) {
		const subquery = this.buildSubquery();
		DbQueryCommon.restoreSubqueryFormatColumnsFromBaseQuery(this._baseQuery, subquery);
		const columns = selector(subquery);
		DbQueryCommon.ensureColumnAliased(columns, true, null)
		let select = this._db.select(columns).from(subquery)

		DbQueryCommon.setFormatColumnsOnBaseQuery(this, select, columns);
		return new DbCollectionQueryable(this._db, select, this._level + 1)
	}

	selectDistinct<TResult extends SelectedFields<any, any>>(selector: (value: TSelection) => TResult) {
		const subquery = this.buildSubquery();
		DbQueryCommon.restoreSubqueryFormatColumnsFromBaseQuery(this._baseQuery, subquery);
		const columns = selector(subquery)
		DbQueryCommon.ensureColumnAliased(columns, true, null)
		let select = this._db.selectDistinct(columns).from(subquery)

		DbQueryCommon.setFormatColumnsOnBaseQuery(this, select, columns);
		return new DbCollectionQueryable(this._db, select, this._level + 1)
	}

	groupBy<TResult extends SelectedFields<any, any>>(selector: (value: TSelection) => TResult) {
		const subquery = this.buildSubquery();
		const groupColumns = selector(subquery);
		DbQueryCommon.ensureColumnAliased(groupColumns, false, null);
		type SelectedType = ReturnType<typeof this.createSelect<typeof groupColumns>>;
		type BaseType = TSelection;

		return new GroupedDbCollectionQueryable(
			this._db,
			(null as any) as SelectedType,
			(this._baseQuery as any) as BaseType,
			this._level + 1,
			(groupColumns as any) as SelectedType,
			subquery
		)
	}

	toList(columnName: string): SQL<SelectResult<TSelection, 'multiple', any>[]> {
		const seq = counter++
		const id = `fnlsq${seq}`
		const subq = this._baseQuery.as(id)

		if (columnName == null) {
			columnName = 'list' + seq
		}

		const retQuery = sql<SelectResult<TSelection, 'multiple', any>[]>`(SELECT COALESCE(json_agg(IDREPLACE.*),'[]') from ${subq})`;
		(retQuery as any).queryChunks[0].value[0] = (retQuery as any).queryChunks[0].value[0].replace('IDREPLACE', id);

		const joinDeclaration: EftifyCollectionJoinDeclaration = {
			columnName: columnName,
			mapFromDriverDefinition: {
				selectedColumns: this._baseQuery._.selectedFields,
				childSelections: this._baseQuery._formatCollections
			},
			isCollectionDeclaration: true,
			sql: retQuery,
			id: id,
		}

		return joinDeclaration as any;
	}

	toNumberList(colName?: string): SQL<number[]> {
		let propName: string = null as any;
		for (const key in this._baseQuery['_']['selectedFields']) {
			propName = key
			break
		}

		const subq = this._baseQuery.as(`fnlsq${counter++}`)
		const col = subq[propName]

		if (!colName) {
			return sql`(SELECT COALESCE(array_agg(${col}), '{}') from ${subq})`
		} else {
			return sql`(SELECT COALESCE(array_agg(${col}), '{}') from ${subq})`.as(colName) as any;
		}
	}

	toStringList(colName?: string): SQL<string[]> {
		let propName: string = null as any;
		for (const key in this._baseQuery['_']['selectedFields']) {
			propName = key
			break
		}

		const subq = this._baseQuery.as(`fnlsq${counter++}`)
		const col = subq[propName]

		if (!colName) {
			return sql`(SELECT COALESCE(array_agg(${col}), '{}') from ${subq})`
		} else {
			return sql`(SELECT COALESCE(array_agg(${col}), '{}') from ${subq})`.as(colName) as any;
		}

	}

	firstOrDefault(columnName: string): SQL<SelectResult<TSelection, 'single', any> | null> {
		const seq = counter++
		const id = `fnlsq${seq}`
		const subq = this._baseQuery.limit(1).as(id)

		if (columnName == null) {
			columnName = 'item' + seq
		}

		const retQuery = sql<SelectResult<TSelection, 'single', any> | null>`(SELECT row_to_json(IDREPLACE.*) AS ${sql.identifier(columnName)} FROM ${subq} LIMIT 1)`;
		(retQuery as any).queryChunks[0].value[0] = (retQuery as any).queryChunks[0].value[0].replace('IDREPLACE', id);

		return retQuery
	}

	where(where: (aliases: TSelection) => SQL | undefined): DbCollectionQueryable<TSelection> {
		let query: any
		const oldWhere = (this._baseQuery as any).config.where
		if (oldWhere == null) {
			query = this._baseQuery.where(where as any)
		} else {
			if (typeof where === 'function') {
				query = this._baseQuery.where(
					and(
						oldWhere,
						where(
							new Proxy(
								(this._baseQuery as any).config.fields,
								new SelectionProxyHandler({
									sqlAliasedBehavior: 'sql',
									sqlBehavior: 'sql'
								})
							)
						)
					)
				)
			} else {
				query = this._baseQuery.where(and(oldWhere, where as any))
			}
		}

		return this.createSelfInstance(query)
	}

	skip(offset: number): DbCollectionQueryable<TSelection> {
		return this.createSelfInstance(this._baseQuery.offset(offset))
	}

	take(count: number): DbCollectionQueryable<TSelection> {
		return this.createSelfInstance(this._baseQuery.limit(count))
	}

	orderBy(
		builder: (aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>
	): DbCollectionQueryable<TSelection> {
		return this.createSelfInstance(this._baseQuery.orderBy(builder as any))
	}

	toSQL() {
		return this._db.select().from(this.buildSubquery()).toSQL()
	}

	private createSelfInstance(query: any): DbCollectionQueryable<TSelection> {
		return new DbCollectionQueryable(this._db, query, this._level)
	}

	private buildSubquery(): any {
		return this._baseQuery.as(`q${this._level}`)
	}

	private buildAggregationQuery(
		builder: (aliases: TSelection) => ValueOrArray<AnyPgColumn | SQL | SQL.Aliased>,
		aggFunc: string,
		alias?: string
	): SQL<number> {
		const subq = this._baseQuery.as(alias ?? `fnlsq${counter++}`)
		return sql<number>`(SELECT COALESCE(${aggFunc}(${builder(subq as any)}),0) from ${subq})`
	}

	private createSelect<TResult extends SelectedFields<any, any>>(
		subquery: any,
		columns: TResult
	) {
		return this._db.select(columns).from(subquery)
	}
}
