ABANONED:
This has been abandoned in favor of custom ORM built using eftify querying principles https://github.com/brunolau/linkgress-orm

# eftify-drizzle-pg

[![npm package][npm-img]][npm-url]
[![Downloads][downloads-img]][downloads-url]
[![Issues][issues-img]][issues-url]

> EF Core-like queries similar to LINQ using Drizzle ORM

## Install

```bash
npm install eftify-drizzle-pg
```

## About the library
Small library attempting to bring other relational syntax to Drizzle ORM similar to LINQ in composition. Might help anyone transitioning from EF Core who does not like the drizzle query API. As for now supports only Postgres database with limited functionality available. No guarantee given whatsover, use at your own risk.

Library can run alongside standard drizzle. All it does is create new "eftify" property on the root drizzle object with new API available.

Mainly developed for our team's needs. There is no plan to develop further than the scope of our needs, in case you're missing a feature, feel free to create a PR.

## Usage

```ts
import { drizzleEftify } from 'eftify-drizzle-pg';
import { and, lt, ne } from 'drizzle-orm';
import * as schema from '../schema/schema';

const queryConnection = postgres(getDbUrl());
const drizzleEftified = drizzleEftify.create(queryConnection, {
	logger: appConfig.database.logQuery,
	schema: schema
});

(async () => {
    const dbContext = drizzleEftified.eftify;

    //All users without projection
    const allUsers = await dbContext.users.toList();

    //All users without projection, sorted
    const sortedUsers = await dbContext.users.orderBy(p => [p.name, p.id]).toList();

    //Queries list
    const result = await dbContext.users.where(p => lt(p.id, 3)).select(p => ({
        id: p.id,
        street: p.userAddress.address,    //Navigation properties in similar manner like in EF
        posts: p.posts.select(p => ({     //Basic One-to-many collection support
            id: p.id,
            text: p.content
        })).toList('posts')               //Due to limitations requires name specification
    })).toList();

    //Queries list obtaining "many" navigation property defined using the {manyCustomDefined} syntax
    const customPostsResult = await dbContext.users.where(p => lt(p.id, 90)).select(p => ({
        id: p.id,
        street: p.userAddress.address,
        custTotal: p.customPosts.select(p => ({
            id: p.id,
            text: p.content
        })).toList('customPosts')
    })).toList();

    //Obtaining author name from post (possibly fixed in 0.0.5)
    const otherWay = dbContext.posts.where(p => eq(p.authorId, 3)).select(p => ({
        id: p.id,
        authorId: p.author.name
    })).firstOrDefault();

    //Single result
    const singleResult = await dbContext.users.where(p => lt(p.id, 3)).select(p => ({
        id: p.id,
        street: p.userAddress.address,    //Navigation properties in similar manner like in EF
        posts: p.posts.select(p => ({     //Basic One-to-many collection support
            id: p.id,
            text: p.content
        })).toList('posty')               //Due to limitations requires name specification
    })).firstOrDefault();

    //Querying from entity joined by array column
    const allGroups = await dbContext.userGroups.select(p => ({
        id: p.id,
        name: p.name,
        users: p.users.select(u => ({
            id: u.id,
            name: u.name
        })).toList('users')
    })).toList();

    //Simple sum
    const summary = await dbContext.users.where(p => and(
        lt(p.id, 2),
        ne(p.id, 0)
    )).sum(p => p.id);

    //Count query
    const userCount = await dbContext.users.where(p => and(
        lt(p.id, 2),
        ne(p.id, 0)
    )).count();

    //Grouping example
    const groupedResult = await dbContext.users.select(p => ({
        id: p.id,
        street: p.userAddress.address,  
        name: p.name
    })).groupBy(p => ({
        street: p.street
    })).select(p => ({
        idCount: p.count(),
        idSum: p.sum(p => p.id),
        street: p.key.street     //Key property holds the grouping key similar to EF Core
    })).toList();

    //Insert example + transaction
    //In case of error thrown in the "async trx" section, it's automatically rolled back
    try {
        const userRow = await dbContext.transaction(async trx => {
            const userRow = await trx.users.insert({
                name: 'new user'
            }).returning({
                id: trx.users.getUnderlyingEntity().id
            });

            //If no chunk size specified, it's autodetected based on object size and PG default parameter count
            const userRowsBulk = await trx.users.insertBulk([
                { name: 'new user bulk1' },
                { name: 'new user bulk2' },
                { name: 'new user bulk3' },
                { name: 'new user bulk4' },
            ], { chunkSize: 1 }).returning({
                id: trx.users.getUnderlyingEntity().id
            });

            const userAddressRow = await trx.userAddress.insert({
                userId: userRow[0].id,
                address: 'some address'
            });

            return { id: userRow[0].id };
        });

        //Performs bulk update updating only the "name" field
        const userRowsBulkUpsert = await dbContext.users.upsertBulk([
            { id: 1, name: `name changed upsert ${new Date().getTime()}`, createdAt: new Date() },
            { id: 2, name: `name changed upsert ${new Date().getTime()}`, createdAt: new Date() }
        ], {
            updateColumns: [
                dbContext.users.getUnderlyingEntity().name
            ]
        });
    } catch (error) {
        console.error(error);
    }

    //Transaction rollback
    try {
        await dbContext.transaction(async trx => {
            const userRow = await trx.users.insert({
                name: 'new user - will be rolled back'
            }).returning({
                id: trx.users.getUnderlyingEntity().id
            });

            const userAddressRow = await trx.userAddress.insert({
                userId: userRow[0].id,
                address: 'some address'
            });

            await trx.rollback();
        });
    } catch (error) { }

    //Update example
    const affectedCount = await dbContext.users.where(p => eq(p.id, 1)).update({
        name: 'changed name'
    });

})();





```

## Sample schema

```ts
import { relations } from 'drizzle-orm';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { eftifyRelations } from 'eftify-drizzle-pg';

// ==================== USERS ====================
export const users = pgTable('users', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity({name: 'users_id_seq'}),
	name: text('name'),
});

export const usersRelations = eftifyRelations(users, ({ one, many, manyCustomDefined }) => ({
    userAddress: one(userAddress, {
        fields: [users.id],
        references: [userAddress.userId],
    }),
    posts: many(posts), //Standard drizzle syntax
    customPosts: manyCustomDefined(posts, {   //Custom eftify syntax allowing navigation specification
        fields: [users.id],
        references: [posts.authorId]
    })
}));

// ==================== USER ADDRESS ====================
export const userAddress = pgTable('user_address', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity({name: 'user_address_id_seq'}),
	userId: integer('sender_user_id').references(() => users.id),
	address: text('address'),
});

export const userAddressRelations = relations(userAddress, ({ one }) => ({
	user: one(users),
}));

// ==================== POST ====================
export const posts = pgTable('posts', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity({name: 'posts_id_seq'}),
	content: text('content'),
	authorId: integer('author_id'),
});
export const postsRelations = relations(posts, ({ one }) => ({
	author: one(users, {
		fields: [posts.authorId],
		references: [users.id],
	}),
}));

// ==================== USER GROUPS ====================
export const userGroups = pgTable('user_groups', {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity({ name: 'user_groups_id_seq' }),
    name: text('name'),
    usersIds: integer('user_ids').array(),
});
export const userGroupsRelations = eftifyRelations(userGroups, ({ manyFromKeyArray }) => ({
    users: manyFromKeyArray(users, {
        fields: [userGroups.usersIds],
        references: [users.id]
    })
}));

// ============ UNRELATED TABLE =================
export const unrelatedTable = pgTable('unrelated_table', {
	id: integer('id').primaryKey().generatedAlwaysAsIdentity({name: 'unrelated_table_id_seq'}),
	sometext: text('sometext'),
});
```



[build-img]:https://github.com/brunolau/eftify-drizzle-pg/actions/workflows/release.yml/badge.svg
[build-url]:https://github.com/brunolau/eftify-drizzle-pg/actions/workflows/release.yml
[downloads-img]:https://img.shields.io/npm/dt/eftify-drizzle-pg
[downloads-url]:https://www.npmtrends.com/eftify-drizzle-pg
[npm-img]:https://img.shields.io/npm/v/eftify-drizzle-pg
[npm-url]:https://www.npmjs.com/package/eftify-drizzle-pg
[issues-img]:https://img.shields.io/github/issues/brunolau/eftify-drizzle-pg
[issues-url]:https://github.com/brunolau/eftify-drizzle-pg/issues
