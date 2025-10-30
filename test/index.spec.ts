import { describe, beforeAll, afterAll, it, expect, beforeEach } from "@jest/globals";
import { drizzleEftify, flagHas, flagHasAll, flagHasAny, flagHasNone } from "../src/index";
import * as schema from '../debug/schema';
import { desc, eq, and } from "drizzle-orm";
import { UserStateFlags } from '../debug/index';
const postgres = require('postgres');

const getDb = () => {
	const dbUrl = process.env.DB_URL;
	if (!dbUrl) {
		throw new Error("DB_URL env is not set");
	}

	const queryConnection = postgres(dbUrl);
	const eftify = drizzleEftify.create(queryConnection, {
		logger: true,
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
			name: 'test user',
			createdAt: new Date()
		});

		const users = await db.users.toList();
		expect(users).toHaveLength(1);
		expect(users[0].name).toBe('test user');
	});

	it('get all users', async () => {
		const dummyUsers = Array.from({ length: 10 }, (_, i) => ({
			name: `test user ${i + 1}`,
			createdAt: new Date()
		}));

		await db.users.insert(dummyUsers);

		const users = await db.users.toList();
		expect(users).toHaveLength(10);

		const userNames = users.map(user => user.name);
		expect(userNames).toEqual(dummyUsers.map(user => user.name));
	});

	it('get user by ID successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to get',
			createdAt: new Date()
		}).returning({
			id: schema.users.id
		});

		const users = await db.users.where(p => eq(p.id, userRow.id)).toList();
		expect(users).toHaveLength(1);
		expect(users[0].name).toBe('test user to get');
	});

	it('fails to get user by ID with incorrect ID', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to get',
			createdAt: new Date()
		}).returning({
			id: schema.users.id
		});

		const users = await db.users.where(p => eq(p.id, 9999)).toList();
		expect(users).toHaveLength(0);
	});

	it('delete user by ID successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to delete',
			createdAt: new Date()
		});

		const usersBeforeDelete = await db.users.toList();
		expect(usersBeforeDelete).toHaveLength(1);

		await db.users.where(p => eq(p.id, usersBeforeDelete[0]?.id)).delete();

		const usersAfterDelete = await db.users.toList();
		expect(usersAfterDelete).toHaveLength(0);
	});

	it('fails to delete user by ID with incorrect ID', async () => {
		const [userRow] = await db.users.insert({
			name: 'test user to delete',
			createdAt: new Date()
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
			name: 'test user to update',
			createdAt: new Date()
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
			name: 'test user to update',
			createdAt: new Date()
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
			name: 'test user for post',
			createdAt: new Date()
		}).returning({
			id: schema.users.id
		});

		const [postRow] = await db.posts.insert({
			content: 'post content with author',
			authorId: userRow.id,
			createdAt: new Date()
		}).returning();

		expect(postRow.content).toBe('post content with author');
		expect(postRow.authorId).toBe(userRow.id);
	});

	it('creates a post without author successfully', async () => {
		const [postRow] = await db.posts.insert({
			content: 'post content without author',
			createdAt: new Date()
		}).returning();

		expect(postRow.content).toBe('post content without author');
		expect(postRow.authorId).toBeNull();
	});

	it('gets posts with specific author successfully', async () => {
		const [userRow1] = await db.users.insert({
			name: 'test user1',
			createdAt: new Date()
		}).returning({
			id: schema.users.id
		});

		const [userRow2] = await db.users.insert({
			name: 'test user2',
			createdAt: new Date()
		}).returning({
			id: schema.users.id
		});

		const [postRow1] = await db.posts.insert({
			content: 'post content with author1',
			authorId: userRow1.id,
			createdAt: new Date()
		});

		const [postRow2] = await db.posts.insert({
			content: 'post content with author1',
			authorId: userRow1.id,
			createdAt: new Date()
		});

		const [postRow3] = await db.posts.insert({
			content: 'post content with author2',
			authorId: userRow2.id,
			createdAt: new Date()
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
			name: 'test user1',
			createdAt: new Date()
		}).returning({
			id: schema.users.id
		});

		const [userRow2] = await db.users.insert({
			name: 'test user2',
			createdAt: new Date()
		}).returning({
			id: schema.users.id
		});

		const [postRow1] = await db.posts.insert({
			content: 'post content with author1',
			authorId: userRow1.id,
			createdAt: new Date()
		});

		const [postRow2] = await db.posts.insert({
			content: 'post content with author1',
			authorId: userRow1.id,
			createdAt: new Date()
		});

		const [postRow3] = await db.posts.insert({
			content: 'post content with author2',
			authorId: userRow2.id,
			createdAt: new Date()
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
			name: 'test user',
			createdAt: new Date()
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
			name: 'test user for multiple addresses',
			createdAt: new Date()
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
			name: 'test user for getting addresses',
			createdAt: new Date()
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
			name: 'test user',
			createdAt: new Date()
		}).returning({
			id: schema.users.id
		});

		const [addressRow] = await db.userAddress.insert({
			userId: userRow.id,
			address: 'Test Address',
		}).returning();

		const [postRow1] = await db.posts.insert({
			content: 'post 1',
			authorId: userRow.id,
			createdAt: new Date()
		}).returning();

		const [postRow2] = await db.posts.insert({
			content: 'post 2',
			authorId: userRow.id,
			createdAt: new Date()
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
			name: `User ${i + 1}`,
			createdAt: new Date()
		}));

		await db.users.insert(dummyUsers);

		const orderedUsers = await db.users.orderBy(p => p.name).toList();
		expect(orderedUsers).toHaveLength(5);
		expect(orderedUsers.map(u => u.name)).toEqual(dummyUsers.map(u => u.name).sort());
	});

	it('order desc users by name successfully', async () => {
		const dummyUsers = Array.from({ length: 5 }, (_, i) => ({
			name: `User ${i + 1}`,
			createdAt: new Date()
		}));

		await db.users.insert(dummyUsers);

		const orderedUsers = await db.users.orderBy(p => desc(p.name)).toList();
		expect(orderedUsers).toHaveLength(5);
		expect(orderedUsers.map(u => u.name)).toEqual(dummyUsers.map(u => u.name).sort().reverse());
	});

	it('gets author name from post successfully', async () => {
		const [userRow] = await db.users.insert({
			name: 'author',
			createdAt: new Date()
		}).returning({
			id: schema.users.id
		});

		const [postRow] = await db.posts.insert({
			content: 'post',
			authorId: userRow.id,
			createdAt: new Date()
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
		const [userRow1] = await db.users.insert({ name: 'User 1', createdAt: new Date() }).returning({ id: schema.users.id });
		const [userRow2] = await db.users.insert({ name: 'User 2', createdAt: new Date() }).returning({ id: schema.users.id });
		const [userRow3] = await db.users.insert({ name: 'User 3', createdAt: new Date() }).returning({ id: schema.users.id });

		const summary = Number(await db.users.sum(p => p.id));
		expect(summary).toBe(userRow1.id + userRow2.id + userRow3.id);
	});

	it('count users with where', async () => {
		const [userRow1] = await db.users.insert({ name: 'User 1', createdAt: new Date() }).returning({ id: schema.users.id });
		const [userRow2] = await db.users.insert({ name: 'User 2', createdAt: new Date() }).returning({ id: schema.users.id });
		const [userRow3] = await db.users.insert({ name: 'User 3', createdAt: new Date() }).returning({ id: schema.users.id });

		const userCount = await db.users.where(p => eq(p.id, userRow1.id)).count();
		expect(userCount).toBe(1);
	});

	it('group by street and aggregate successfully', async () => {
		const [userRow1] = await db.users.insert({ name: 'User 1', createdAt: new Date() }).returning({ id: schema.users.id });
		const [userRow2] = await db.users.insert({ name: 'User 2', createdAt: new Date() }).returning({ id: schema.users.id });

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
					name: 'new user',
					createdAt: new Date()
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

	it('creates users with different state flags', async () => {
		const users = [
			{ name: 'Active User', createdAt: new Date(), state: UserStateFlags.Active },
			{ name: 'Verified User', createdAt: new Date(), state: UserStateFlags.Verified },
			{ name: 'Slave User', createdAt: new Date(), state: UserStateFlags.Slave },
			{ name: 'Active + Verified', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified },
			{ name: 'Active + Slave', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Slave },
			{ name: 'Verified + Slave', createdAt: new Date(), state: UserStateFlags.Verified | UserStateFlags.Slave },
			{ name: 'All Flags', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified | UserStateFlags.Slave },
		];

		await db.users.insert(users);

		const allUsers = await db.users.toList();
		expect(allUsers).toHaveLength(7);

		const activeUser = allUsers.find(u => u.name === 'Active User');
		expect(activeUser?.state).toBe(UserStateFlags.Active);

		const allFlagsUser = allUsers.find(u => u.name === 'All Flags');
		expect(allFlagsUser?.state).toBe(UserStateFlags.Active | UserStateFlags.Verified | UserStateFlags.Slave);
	});

	it('finds users with specific flag using flagHas', async () => {
		await db.users.insert([
			{ name: 'Active User', createdAt: new Date(), state: UserStateFlags.Active },
			{ name: 'Verified User', createdAt: new Date(), state: UserStateFlags.Verified },
			{ name: 'Active + Verified', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified },
		]);

		const verifiedUsers = await db.users.where(p =>
			flagHas(p.state, UserStateFlags.Verified)
		).select(p => ({
			id: p.id,
			name: p.name,
			state: p.state
		})).toList();

		expect(verifiedUsers).toHaveLength(2);
		expect(verifiedUsers.map(u => u.name).sort()).toEqual(['Active + Verified', 'Verified User']);

		const activeUsers = await db.users.where(p =>
			flagHas(p.state, UserStateFlags.Active)
		).toList();

		expect(activeUsers).toHaveLength(2);
		expect(activeUsers.map(u => u.name).sort()).toEqual(['Active + Verified', 'Active User']);
	});

	it('finds users with ALL specified flags using flagHasAll', async () => {
		await db.users.insert([
			{ name: 'Only Active', createdAt: new Date(), state: UserStateFlags.Active },
			{ name: 'Only Verified', createdAt: new Date(), state: UserStateFlags.Verified },
			{ name: 'Active + Verified', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified },
			{ name: 'Active + Slave', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Slave },
			{ name: 'All Three', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified | UserStateFlags.Slave },
		]);

		const activeAndVerifiedUsers = await db.users.where(p =>
			flagHasAll(p.state, UserStateFlags.Active | UserStateFlags.Verified)
		).toList();

		expect(activeAndVerifiedUsers).toHaveLength(2);
		expect(activeAndVerifiedUsers.map(u => u.name).sort()).toEqual(['Active + Verified', 'All Three']);

		const allThreeFlags = await db.users.where(p =>
			flagHasAll(p.state, UserStateFlags.Active | UserStateFlags.Verified | UserStateFlags.Slave)
		).toList();

		expect(allThreeFlags).toHaveLength(1);
		expect(allThreeFlags[0].name).toBe('All Three');
	});

	it('finds users with ANY of specified flags using flagHasAny', async () => {
		await db.users.insert([
			{ name: 'Only Active', createdAt: new Date(), state: UserStateFlags.Active },
			{ name: 'Only Verified', createdAt: new Date(), state: UserStateFlags.Verified },
			{ name: 'Only Banned', createdAt: new Date(), state: UserStateFlags.Banned },
			{ name: 'Only Slave', createdAt: new Date(), state: UserStateFlags.Slave },
			{ name: 'Active + Slave', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Slave },
		]);

		const activeOrSlaveUsers = await db.users.where(p =>
			flagHasAny(p.state, UserStateFlags.Active | UserStateFlags.Slave)
		).toList();

		expect(activeOrSlaveUsers).toHaveLength(3);
		expect(activeOrSlaveUsers.map(u => u.name).sort()).toEqual(['Active + Slave', 'Only Active', 'Only Slave']);

		const verifiedOrBannedUsers = await db.users.where(p =>
			flagHasAny(p.state, UserStateFlags.Verified | UserStateFlags.Banned)
		).toList();

		expect(verifiedOrBannedUsers).toHaveLength(2);
		expect(verifiedOrBannedUsers.map(u => u.name).sort()).toEqual(['Only Banned', 'Only Verified']);
	});

	it('finds users WITHOUT specific flag using flagHasNone', async () => {
		await db.users.insert([
			{ name: 'Good User', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified },
			{ name: 'Verified User', createdAt: new Date(), state: UserStateFlags.Verified },
			{ name: 'Banned User', createdAt: new Date(), state: UserStateFlags.Banned },
			{ name: 'Banned + Verified', createdAt: new Date(), state: UserStateFlags.Banned | UserStateFlags.Verified },
		]);

		const notBannedUsers = await db.users.where(p =>
			flagHasNone(p.state, UserStateFlags.Banned)
		).toList();

		expect(notBannedUsers).toHaveLength(2);
		expect(notBannedUsers.map(u => u.name).sort()).toEqual(['Good User', 'Verified User']);

		const notVerifiedUsers = await db.users.where(p =>
			flagHasNone(p.state, UserStateFlags.Verified)
		).toList();

		expect(notVerifiedUsers).toHaveLength(1);
		expect(notVerifiedUsers.map(u => u.name).sort()).toEqual(['Banned User']);
	});

	it('handles complex flag queries with AND/OR conditions', async () => {
		await db.users.insert([
			{ name: 'Active Only', createdAt: new Date(), state: UserStateFlags.Active },
			{ name: 'Verified Only', createdAt: new Date(), state: UserStateFlags.Verified },
			{ name: 'Active + Verified', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified },
			{ name: 'Slave + Verified', createdAt: new Date(), state: UserStateFlags.Slave | UserStateFlags.Verified },
			{ name: 'Banned + Verified', createdAt: new Date(), state: UserStateFlags.Banned | UserStateFlags.Verified },
			{ name: 'All Flags', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified | UserStateFlags.Slave },
		]);

		const verifiedNotBannedUsers = await db.users.where(p =>
			and(
				flagHas(p.state, UserStateFlags.Verified),
				flagHasNone(p.state, UserStateFlags.Banned)
			)
		).toList();

		expect(verifiedNotBannedUsers).toHaveLength(4);
		expect(verifiedNotBannedUsers.map(u => u.name).sort()).toEqual([
			'Active + Verified', 'All Flags', 'Slave + Verified', 'Verified Only'
		]);

		const activeVerifiedNotBannedUsers = await db.users.where(p =>
			and(
				flagHasAll(p.state, UserStateFlags.Active | UserStateFlags.Verified),
				flagHasNone(p.state, UserStateFlags.Banned)
			)
		).toList();

		expect(activeVerifiedNotBannedUsers).toHaveLength(2);
		expect(activeVerifiedNotBannedUsers.map(u => u.name).sort()).toEqual(['Active + Verified', 'All Flags']);
	});

	it('includes flag status as boolean columns in results', async () => {
		await db.users.insert([
			{ name: 'Test User', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified | UserStateFlags.Slave },
		]);

		const usersWithFlags = await db.users.where(p =>
			flagHas(p.state, UserStateFlags.Active)
		).select(p => ({
			id: p.id,
			name: p.name,
			state: p.state,
			isActive: flagHas(p.state, UserStateFlags.Active),
			isVerified: flagHas(p.state, UserStateFlags.Verified),
			isSlave: flagHas(p.state, UserStateFlags.Slave),
			isBanned: flagHas(p.state, UserStateFlags.Banned),
		})).toList();

		expect(usersWithFlags).toHaveLength(1);
		const user = usersWithFlags[0];
		expect(user.name).toBe('Test User');
		expect(user.state).toBe(UserStateFlags.Active | UserStateFlags.Verified | UserStateFlags.Slave);
		expect(!!user.isActive).toBe(true);
		expect(!!user.isVerified).toBe(true);
		expect(!!user.isSlave).toBe(true);
		expect(!!user.isBanned).toBe(false);
	});

	it('correctly handles edge cases with zero and all flags', async () => {
		await db.users.insert([
			{ name: 'No Flags', createdAt: new Date(), state: 0 },
			{ name: 'All Flags', createdAt: new Date(), state: UserStateFlags.Active | UserStateFlags.Verified | UserStateFlags.Slave | UserStateFlags.Banned },
		]);

		const noFlagUsers = await db.users.where(p =>
			flagHasNone(p.state, UserStateFlags.Active)
		).toList();

		const noFlagUser = noFlagUsers.find(u => u.name === 'No Flags');
		expect(noFlagUser).toBeDefined();

		const allFlagUsers = await db.users.where(p =>
			flagHasAll(p.state, UserStateFlags.Active | UserStateFlags.Verified | UserStateFlags.Slave | UserStateFlags.Banned)
		).toList();

		const allFlagUser = allFlagUsers.find(u => u.name === 'All Flags');
		expect(allFlagUser).toBeDefined();
	});

	it('updates user name based on related address', async () => {
		const [userRow] = await db.users.insert({
			name: 'User to Update',
			createdAt: new Date(),
		}).returning({
			id: schema.users.id
		});

		const [addressRow] = await db.userAddress.insert({
			userId: userRow.id,
			address: 'Test Address',
		}).returning();

		console.log(userRow, addressRow);


		await db.users.where(p => eq(p.userAddress.address, 'Test Address')).update({
			name: 'Updated User'
		});

		const updatedUser = await db.users.where(user => eq(user.id, userRow.id)).firstOrDefault();
		expect(updatedUser).toBeDefined();
		expect(updatedUser?.name).toBe('Updated User');
	});

	it('updates user address based on user name', async () => {
		const [userRow] = await db.users.insert({
			name: 'User for Address Update',
			createdAt: new Date(),
		}).returning({
			id: schema.users.id
		});

		const [addressRow] = await db.userAddress.insert({
			userId: userRow.id,
			address: 'Old Address',
		}).returning({
			id: schema.userAddress.id
		});

		await db.userAddress.where(ua => eq(ua.user.name, 'User for Address Update')).update({
			address: 'New Address'
		});

		const updatedAddress = await db.userAddress.where(ua => eq(ua.id, addressRow.id)).firstOrDefault();
		expect(updatedAddress).toBeDefined();
		expect(updatedAddress?.address).toBe('New Address');
	});

	it('updates post content based on related user name', async () => {
		const [userRow] = await db.users.insert({
			name: 'Author Name',
			createdAt: new Date(),
		}).returning({
			id: schema.users.id
		});

		const [postRow] = await db.posts.insert({
			content: 'Original Content',
			authorId: userRow.id,
			createdAt: new Date(),
		}).returning({
			id: schema.posts.id
		});

		await db.posts.where(p => eq(p.author.name, 'Author Name')).update({
			content: 'Updated Content'
		});

		const updatedPost = await db.posts.where(post => eq(post.id, postRow.id)).firstOrDefault();
		expect(updatedPost).toBeDefined();
		expect(updatedPost?.content).toBe('Updated Content');
	});
});
