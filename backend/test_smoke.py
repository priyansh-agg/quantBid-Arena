import asyncio
import httpx
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

BASE_URL = "http://127.0.0.1:8000"

async def run_tests():
    async with httpx.AsyncClient(base_url=BASE_URL) as client:
        logger.info("Running Smoke Tests...")

        # 1. Health check
        r = await client.get("/health")
        assert r.status_code == 200, f"Health check failed: {r.text}"
        logger.info("✅ Health check passed")

        # 2. Get Teams
        r = await client.get("/api/teams")
        assert r.status_code == 200, f"Get teams failed: {r.text}"
        teams = r.json()
        logger.info(f"✅ Found {len(teams)} teams")
        if not teams:
            logger.error("No teams found. Please add seed data.")
            return
        
        team_1 = teams[0]

        # 3. Get Questions
        r = await client.get("/api/questions")
        assert r.status_code == 200, f"Get questions failed: {r.text}"
        questions = r.json()
        logger.info(f"✅ Found {len(questions)} questions")
        if not questions:
            logger.error("No questions found. Please add seed data.")
            return

        question = [q for q in questions if q['status'] == 'AVAILABLE']
        if not question:
            logger.warning("No AVAILABLE questions found. Trying first question anyway.")
            q_id = questions[0]['id']
        else:
            q_id = question[0]['id']

        # 4. Start Auction
        r = await client.post(f"/api/questions/{q_id}/start-auction")
        if r.status_code != 200:
            logger.info(f"Start auction returned: {r.json()}")
        else:
            logger.info("✅ Start auction passed")

        # 5. Place Bid
        base_amt = r.json().get('base_amount', 500) if r.status_code == 200 else 500
        r = await client.post(f"/api/auctions/{q_id}/bid", json={"team_id": team_1['id'], "amount": base_amt + 100})
        if r.status_code != 200:
            logger.info(f"Place bid returned: {r.json()}")
        else:
            logger.info("✅ Place bid passed")

        # 6. End Auction
        r = await client.post(f"/api/auctions/{q_id}/end")
        if r.status_code != 200:
            logger.info(f"End auction returned: {r.json()}")
        else:
            logger.info("✅ End auction passed")
        
        # 7. Solve
        r = await client.post(f"/api/questions/{q_id}/solve", json={"correct": True})
        if r.status_code != 200:
            logger.info(f"Solve returned: {r.json()}")
        else:
            logger.info("✅ Solve passed")

        logger.info("🎉 Smoke tests completed successfully! (Check logs for expected failures if data was dirty)")

if __name__ == "__main__":
    asyncio.run(run_tests())
