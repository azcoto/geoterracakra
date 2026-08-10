## Running The Application

* Clone the repository.
* Run the stack `docker-compose up -d` to start the development stack.
* Copy data folder from https://drive.google.com/drive/folders/1Ou8v6PtpvQwcK4oEFCU2LZAyjJcCixov
* Restore `dump.sql` to the database using `docker exec -i <db_container_name> psql -U <db_user> -d <db_name> < dump.sql`
* Install dependencies using `pnpm install`
* Start the application using `pnpm dev`