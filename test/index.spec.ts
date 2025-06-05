import { describe, beforeAll, afterAll, it, expect, beforeEach } from "@jest/globals";
import { drizzleEftify } from "../src/index";
import * as schema from '../debug/schema';
import { desc, eq } from "drizzle-orm";
const postgres = require('postgres');

const getDb = () => {
	const dbUrl = process.env.DB_URL;
	if (!dbUrl) {
		throw new Error("DB_URL env is not set");
	}

	const queryConnection = postgres(dbUrl);
	const eftify = drizzleEftify.create(queryConnection, {
		logger: false,
		schema: schema
	})?.eftify;

	return {
		queryConnection,
		eftify
	}
}

const truncateTables = async (db: DbType) => {
	await db.userAddress.deleteAll();
	await db.users.deleteAll();
	await db.posts.deleteAll();
};

type DbType = NonNullable<ReturnType<typeof getDb>>['eftify'];

describe('index test', () => {
	let db: DbType;
	let queryConnection: ReturnType<typeof postgres>;

	beforeAll(async () => {
		const dbRes = getDb();
		db = dbRes.eftify;
		queryConnection = dbRes.queryConnection;

		await truncateTables(db);
	});

	beforeEach(async () => {
		await truncateTables(db);
	});

	afterAll(async () => {
		await queryConnection.end();
	});

	it('insert name successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user'
		});

		const users = await db.users.toList();
		expect(users).toHaveLength(1);
		expect(users[0].name).toBe('test user');
	});

	it('get all users', async () => {
		const dummyUsers = Array.from({ length: 10 }, (_, i) => ({
			name: `test user ${i + 1}`
		}));

		await db.users.insert(dummyUsers);

		const users = await db.users.toList();
		expect(users).toHaveLength(10);

		const userNames = users.map(user => user.name);
		expect(userNames).toEqual(dummyUsers.map(user => user.name));
	});

	it('get user by ID successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to get'
		}).returning({
			id: schema.users.id
		});

		const users = await db.users.where(p => eq(p.id, userRow.id)).toList();
		expect(users).toHaveLength(1);
		expect(users[0].name).toBe('test user to get');
	});

	it('fails to get user by ID with incorrect ID', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to get'
		}).returning({
			id: schema.users.id
		});

		const users = await db.users.where(p => eq(p.id, 9999)).toList();
		expect(users).toHaveLength(0);
	});

	it('delete user by ID successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to delete'
		});

		const usersBeforeDelete = await db.users.toList();
		expect(usersBeforeDelete).toHaveLength(1);

		await db.users.where(p => eq(p.id, usersBeforeDelete[0]?.id)).delete();

		const usersAfterDelete = await db.users.toList();
		expect(usersAfterDelete).toHaveLength(0);
	});

	it('fails to delete user by ID with incorrect ID', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to delete'
		});

		const usersBeforeDelete = await db.users.toList();
		expect(usersBeforeDelete).toHaveLength(1);

		await db.users.where(p => eq(p.id, 9999)).delete();

		const usersAfterDelete = await db.users.toList();
		expect(usersAfterDelete).toHaveLength(1);
		expect(usersAfterDelete[0].id).toBe(usersBeforeDelete[0].id);
	});

	it('update user name successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to update'
		});

		const usersBeforeUpdate = await db.users.toList();
		expect(usersBeforeUpdate).toHaveLength(1);

		await db.users.where(p => eq(p.id, usersBeforeUpdate[0]?.id)).update({
			name: 'updated user name'
		});

		const usersAfterUpdate = await db.users.toList();
		expect(usersAfterUpdate).toHaveLength(1);
		expect(usersAfterUpdate[0].name).toBe('updated user name');
	});

	it('fails to update user name with incorrect ID', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to update'
		});

		const usersBeforeUpdate = await db.users.toList();
		expect(usersBeforeUpdate).toHaveLength(1);

		await db.users.where(p => eq(p.id, 9999)).update({
			name: 'updated user name'
		});

		const usersAfterUpdate = await db.users.toList();
		expect(usersAfterUpdate).toHaveLength(1);
		expect(usersAfterUpdate[0].name).toBe('test user to update');
	});

	it('creates a post with author successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user for post'
		}).returning({
			id: schema.users.id
		});

		const [postRow] = await db.posts.insert({
			content: 'post content with author',
			authorId: userRow.id
		}).returning();

		expect(postRow.content).toBe('post content with author');
		expect(postRow.authorId).toBe(userRow.id);
	});

	it('creates a post without author successfully', async () => {
		const [postRow] = await db.posts.insert({
			content: 'post content without author'
		}).returning();

		expect(postRow.content).toBe('post content without author');
		expect(postRow.authorId).toBeNull();
	});

	it('gets posts with specific author successfully', async () => {
		const [userRow1] = await db.users.insert({
			name: 'test user1'
		}).returning({
			id: schema.users.id
		});

		const [userRow2] = await db.users.insert({
			name: 'test user2'
		}).returning({
			id: schema.users.id
		});

		const [postRow1] = await db.posts.insert({
			content: 'post content with author1',
			authorId: userRow1.id
		});

		const [postRow2] = await db.posts.insert({
			content: 'post content with author1',
			authorId: userRow1.id
		});

		const [postRow3] = await db.posts.insert({
			content: 'post content with author2',
			authorId: userRow2.id
		});

		const query = db.posts;
		expect(await query.toList()).toHaveLength(3);

		const postsWithAuthor1 = await query.where(p => eq(p.authorId, userRow1.id)).toList();
		expect(postsWithAuthor1).toHaveLength(2);
		expect(postsWithAuthor1.every(p => p.authorId == userRow1.id)).toBe(true);
		expect(['post content with author1', 'post content with author1'].every(c => postsWithAuthor1.some(p => p.content == c))).toBe(true);
	});

	it('gets users with their posts successfully', async () => {
		const [userRow1] = await db.users.insert({
			name: 'test user1'
		}).returning({
			id: schema.users.id
		});

		const [userRow2] = await db.users.insert({
			name: 'test user2'
		}).returning({
			id: schema.users.id
		});

		const [postRow1] = await db.posts.insert({
			content: 'post content with author1',
			authorId: userRow1.id
		});

		const [postRow2] = await db.posts.insert({
			content: 'post content with author1',
			authorId: userRow1.id
		});

		const [postRow3] = await db.posts.insert({
			content: 'post content with author2',
			authorId: userRow2.id
		});

		const usersWithposts = await db.users.select(u => ({
			id: u.id,
			name: u.name,
			posts: u.posts.select(p => ({
				id: p.id,
				content: p.content,
				authorId: p.authorId
			})).toList('posts')
		})).toList();

		expect(usersWithposts).toHaveLength(2);

		const user1Withposts = usersWithposts.find(u => u.id == userRow1.id);
		expect(user1Withposts?.posts).toHaveLength(2);

		const user2Withposts = usersWithposts.find(u => u.id == userRow2.id);
		expect(user2Withposts?.posts).toHaveLength(1);

		expect(user1Withposts?.posts.every(p => p.authorId == userRow1.id)).toBe(true);
		expect(user2Withposts?.posts.every(p => p.authorId == userRow2.id)).toBe(true);
	});

	it('creates user address successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user'
		}).returning({
			id: schema.users.id
		});

		const [addressRow] = await db.userAddress.insert({
			userId: userRow.id,
			address: 'Test Address',
		}).returning();

		expect(addressRow.userId).toBe(userRow.id);
		expect(addressRow.address).toBe('Test Address');
	});

	it('assign multiple addresses to a user successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user for multiple addresses'
		}).returning({
			id: schema.users.id
		});

		const addresses = [
			{ userId: userRow.id, address: 'Address 1' },
			{ userId: userRow.id, address: 'Address 2' },
			{ userId: userRow.id, address: 'Address 3' }
		];

		await db.userAddress.insert(addresses);

		const userAddresses = await db.userAddress.where(ua => eq(ua.userId, userRow.id)).toList();
		expect(userAddresses).toHaveLength(3);
		expect(userAddresses.map(ua => ua.address)).toEqual(['Address 1', 'Address 2', 'Address 3']);
	});

	it('gets user addresses successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user for getting addresses'
		}).returning({
			id: schema.users.id
		});

		const addresses = [
			{ userId: userRow.id, address: 'Address 1' },
			{ userId: userRow.id, address: 'Address 2' },
			{ userId: userRow.id, address: 'Address 3' }
		];

		await db.userAddress.insert(addresses);

		const userAddresses = await db.userAddress.where(ua => eq(ua.userId, userRow.id)).toList();
		expect(userAddresses).toHaveLength(3);
		expect(userAddresses.map(ua => ua.address)).toEqual(['Address 1', 'Address 2', 'Address 3']);
	});

	it('gets user posts through user address successfully (2 levels)', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user'
		}).returning({
			id: schema.users.id
		});

		const [addressRow] = await db.userAddress.insert({
			userId: userRow.id,
			address: 'Test Address',
		}).returning();

		const [postRow1] = await db.posts.insert({
			content: 'post 1',
			authorId: userRow.id
		}).returning();

		const [postRow2] = await db.posts.insert({
			content: 'post 2',
			authorId: userRow.id
		}).returning();

		const nestedResults = await db.userAddress.select(p => ({
			id: p.id,
			posts: p.user.posts.select(p => ({
				id: p.id,
				content: p.content
			})).toList('posts')
		})).toList();

		expect(nestedResults).toHaveLength(1);
		expect(nestedResults[0].id).toBe(addressRow.id);
		expect(nestedResults[0].posts).toHaveLength(2);
		expect(nestedResults[0].posts.map(p => p.content)).toEqual(['post 1', 'post 2']);
	});

	it('order asc users by name successfully', async () => {
		const dummyUsers = Array.from({ length: 5 }, (_, i) => ({
			name: `User ${i + 1}`
		}));

		await db.users.insert(dummyUsers);

		const orderedUsers = await db.users.orderBy(p => p.name).toList();
		expect(orderedUsers).toHaveLength(5);
		expect(orderedUsers.map(u => u.name)).toEqual(dummyUsers.map(u => u.name).sort());
	});

	it('order desc users by name successfully', async () => {
		const dummyUsers = Array.from({ length: 5 }, (_, i) => ({
			name: `User ${i + 1}`
		}));

		await db.users.insert(dummyUsers);

		const orderedUsers = await db.users.orderBy(p => desc(p.name)).toList();
		expect(orderedUsers).toHaveLength(5);
		expect(orderedUsers.map(u => u.name)).toEqual(dummyUsers.map(u => u.name).sort().reverse());
	});

	it('gets author name from post successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'author'
		}).returning({
			id: schema.users.id
		});

		const [postRow] = await db.posts.insert({
			content: 'post',
			authorId: userRow.id
		}).returning();

		const postWithAuthor = await db.posts.where(p => eq(p.id, postRow.id)).select(p => ({
			id: p.id,
			content: p.content,
			authorName: p.author.name
		})).firstOrDefault();

		expect(postWithAuthor).toBeDefined();
		expect(postWithAuthor?.authorName).toBe('author');
	});

	it('simple sum of user IDs', async () => {
		const [userRow1] = await db.users.insert({ name: 'User 1' }).returning({ id: schema.users.id });
		const [userRow2] = await db.users.insert({ name: 'User 2' }).returning({ id: schema.users.id });
		const [userRow3] = await db.users.insert({ name: 'User 3' }).returning({ id: schema.users.id });

		const summary = Number(await db.users.sum(p => p.id));
		expect(summary).toBe(userRow1.id + userRow2.id + userRow3.id);
	});

	it('count users with where', async () => {
		const [userRow1] = await db.users.insert({ name: 'User 1' }).returning({ id: schema.users.id });
		const [userRow2] = await db.users.insert({ name: 'User 2' }).returning({ id: schema.users.id });
		const [userRow3] = await db.users.insert({ name: 'User 3' }).returning({ id: schema.users.id });

		const userCount = await db.users.where(p => eq(p.id, userRow1.id)).count();
		expect(userCount).toBe(1);
	});

	it('group by street and aggregate successfully', async () => {
		const [userRow1] = await db.users.insert({ name: 'User 1' }).returning({ id: schema.users.id });
		const [userRow2] = await db.users.insert({ name: 'User 2' }).returning({ id: schema.users.id });

		await db.userAddress.insert([
			{ userId: userRow1.id, address: 'address1' },
			{ userId: userRow2.id, address: 'address1' },
			{ userId: userRow1.id, address: 'address2' }
		]);

		const groupedResult = await db.users.select(p => ({
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

		expect(groupedResult).toHaveLength(2);
		expect(Number(groupedResult.find(g => g.street == 'address1')?.idCount)).toBe(2);
		expect(Number(groupedResult.find(g => g.street == 'address2')?.idCount)).toBe(1);
	});

	it('insert successfully new user in transaction without rollback', async () => {
		const userRow = await db.transaction(async trx => {
			try {
				const userRow = await trx.users.insert({
					name: 'new user'
				}).returning({
					id: trx.users.getUnderlyingEntity().id
				});

				return { id: userRow[0].id };
			} catch (error) {
				await trx.rollback();
			}
		})

		const users = await db.users.toList();
		expect(users).toHaveLength(1);
		expect(userRow).toBeDefined();
		expect(userRow.id).toBeDefined();
		expect(users[0].id).toBe(userRow.id);
	});

	it('fails to insert new user in transaction with rollback', async () => {
		let userRow: void = null;
		try {
			userRow = await db.transaction(async (trx: any) => {
				try {
					const userRow = await trx.users.insert({
						name: 'new user with rollback'
					}).returning({
						id: trx.users.getUnderlyingEntity().id
					});

					throw new Error('Rollback');
				} catch (error) {
					await trx.rollback();
				}
			});
		} catch (error) {
			// drizzle excption
		} finally {
			const users = await db.users.toList();
			expect(users).toHaveLength(0);
			expect(userRow).toBeNull();
		}
	});
});
